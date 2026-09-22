export const meta = {
  name: 'fix-issues',
  description:
    'Resolve a list of GitHub issues: per issue, an implementer opens a draft PR, a cold reviewer critiques it, and the implementer revises until the review converges (or a round cap is hit). Converged PRs are marked ready for human review; stuck ones are labeled needs-human and left as drafts.',
  phases: [{ title: 'Implement' }, { title: 'Review' }, { title: 'Finalize' }],
}

// ---------------------------------------------------------------------------
// Inputs (via `args`):
//   { issues: number[], maxRounds?: number, baseBranch?: string }
// or just a bare array of issue numbers.
// ---------------------------------------------------------------------------
const issues = Array.isArray(args) ? args : (args?.issues ?? [])
const MAX_ROUNDS = (Array.isArray(args) ? undefined : args?.maxRounds) ?? 3
const BASE = (Array.isArray(args) ? undefined : args?.baseBranch) ?? 'main'
// Where per-issue worktrees are created. Matches this devcontainer's layout.
const WORKTREE_ROOT = '/workspace/opus/.claude/worktrees'

if (!issues.length) {
  log('No issues provided. Pass { issues: [123, 145] } as args.')
  return { error: 'no-issues' }
}
log(`Resolving ${issues.length} issue(s): ${issues.join(', ')} (max ${MAX_ROUNDS} review rounds each)`)

// ---------------------------------------------------------------------------
// Structured contracts. The reviewer's verdict is the convergence signal —
// schema-validated so "converged?" is a boolean check, not a judgment call.
// ---------------------------------------------------------------------------
const IMPL_SCHEMA = {
  type: 'object',
  required: ['ok', 'prNumber'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'true if a draft PR exists and the work is pushed' },
    prNumber: { type: ['integer', 'null'], description: 'the draft PR number, or null if it could not be opened' },
    prUrl: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string', description: 'commands run to verify + their pass/fail result' },
    summary: { type: 'string', description: 'one-paragraph description of the change' },
    notes: { type: 'string', description: 'assumptions, blockers, or why ok=false' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONVERGED', 'CHANGES_REQUESTED'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'location', 'problem', 'fix'],
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          location: { type: 'string', description: 'file:line or area' },
          problem: { type: 'string' },
          fix: { type: 'string', description: 'concrete suggested fix' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

// A PR has converged only when the reviewer says so AND raises nothing blocking.
// nits are allowed through; must-fix/should-fix are not.
const isBlocking = (f) => f.severity === 'must-fix' || f.severity === 'should-fix'
const hasConverged = (v) => v.verdict === 'CONVERGED' && !(v.findings ?? []).some(isBlocking)

// ---------------------------------------------------------------------------
// Prompt builders.
// ---------------------------------------------------------------------------
const REPO_CONVENTIONS = `
## Repo conventions you MUST honor (@twin-digital/monorepo / Opus — see CLAUDE.md)
- ESM + NodeNext: relative imports carry explicit \`.js\` extensions; \`import type\` for type-only imports.
- Source-first: work in \`src/\`; build/test only the package you're editing (\`pnpm --filter <pkg> build|test|lint|typecheck\`). Run \`pnpm install\` in the worktree if node_modules is missing; some devtools config packages (\`@twin-digital/vitest-config\`, \`@twin-digital/eslint-config\`) may need a one-time \`pnpm --filter <them> build\` for their dist/ before lint/test resolve.
- Tests are colocated \`*.test.ts\`, vitest (describe/it/expect).
- CHANGESET IS REQUIRED for any change under a package's \`src/\` (or that affects a published package): create a file under \`.changeset/\` with frontmatter selecting EVERY impacted package (including private apps/bots) and a bump type. For changes touching NO package (CI, docs, repo tooling) create an EMPTY changeset (empty \`---\`/\`---\` frontmatter + a summary line).
- Do NOT hand-edit repo-kit-generated files (per-package eslint.config.js, tsconfig*.json, package.json scripts/engines, .nvmrc, tsdown.config.ts, README package list). To change those, edit \`.repo-kit.yml\` / shared devtools config and run \`pnpm sync\`. Root-level files (root package.json, root configs, .github/workflows) are fine to edit directly.
- Don't hand-format against Prettier. Conventional-commit messages.
`

const implementPrompt = (issueNum, branch, worktree) => `
You are implementing a fix for GitHub issue #${issueNum} in the \`@twin-digital/monorepo\` (Opus) repo.

## Workspace — set up your own isolated subtree (idempotent)
Your branch is \`${branch}\`; your worktree is \`${worktree}\`.
Run this FIRST (it works whether or not the worktree already exists):
\`\`\`bash
if [ ! -d "${worktree}" ]; then
  git -C /workspace/opus fetch origin ${BASE} --quiet
  git -C /workspace/opus worktree add -b ${branch} "${worktree}" origin/${BASE}
fi
cd "${worktree}" && git rev-parse --abbrev-ref HEAD
\`\`\`
Work EXCLUSIVELY inside \`${worktree}\`. Do NOT touch other worktrees or /workspace/opus directly.

## The issue
Read it fully: \`gh issue view ${issueNum}\` (and any linked PR/discussion it references). Understand the actual ask and the acceptance criteria.

## CRITICAL — suitability re-check (triage is only advisory)
Before writing code, judge whether this issue is genuinely completable by an agent WITHOUT human input. If it's actually a research/recommendation/decision ticket, or it needs external-console/infra/credentials, or the acceptance criterion is "a decision is recorded" — STOP. Do not force a PR. Return ok=false with notes explaining why it needs a human, and do NOT open a PR.

## Implement
- Make a clean, minimal, on-point change. Match surrounding code style. Comments describe the final design, not the path to it.
- Add/extend colocated vitest tests with real (non-tautological) assertions covering the new behavior.
- Add the appropriate changeset (see conventions below).
${REPO_CONVENTIONS}
## Verify (scoped to the package you touched)
Run \`pnpm --filter <pkg> test\`, \`... lint\`, \`... typecheck\` and FIX anything that fails. For changes that can't be exercised locally (e.g. CI workflow YAML), validate what you can (actionlint, YAML parse, prettier --check) and desk-check the logic; say so explicitly.

## Open a DRAFT PR
Commit (conventional message), push the branch, then:
\`gh pr create --draft --base ${BASE} --title "..." --body "..."\` — the body MUST include \`Closes #${issueNum}\`, a summary, and how you verified. Keep it a DRAFT.

## Return (StructuredOutput)
Return the schema object: ok (true only if a draft PR is open and pushed), prNumber, prUrl, filesChanged, verification (exact commands + results), summary, notes. Your output is consumed by an orchestrator, not shown to a human.
`

const reviewPrompt = (issueNum, prNumber, worktree) => `
You are a senior engineer doing a COLD, independent review of draft PR #${prNumber} in the \`@twin-digital/monorepo\` (Opus) repo. You did NOT write this code and have no context on how it was built — review only what's in front of you. Be rigorous and skeptical but fair: separate genuine blockers from nits.

## What it claims to do
Resolve GitHub issue #${issueNum}. Read both:
- \`gh issue view ${issueNum}\` — the actual requirement and acceptance criteria.
- \`gh pr view ${prNumber}\` and \`gh pr diff ${prNumber}\` — the change.
You may read full files READ-ONLY in the worktree \`${worktree}\` for context. Do NOT modify, commit, or push anything. You MAY run the package's tests/lint/typecheck read-only to INDEPENDENTLY verify the implementer's claims (don't trust them) — for CI/workflow-only changes that can't run locally, desk-check the logic and validate YAML/actionlint instead, and say so.

## Evaluate
- Correctness: does it actually satisfy the issue? Edge cases, error paths, off-by-ones, race conditions.
- Tests: do they meaningfully cover the new behavior with real assertions (not tautologies)? Independently confirm they pass.
- Security: input validation, secret/credential leakage, injection, least-privilege.
- Conventions: \`.js\` import extensions, \`import type\`, colocated tests, a correct changeset (real with right packages+bump, or empty for non-package changes), no hand-edited repo-kit-generated files, Prettier-clean.
- Robustness & regressions: anything the change breaks or any pre-existing behavior it silently drops.
- Completeness: anything in the issue left unaddressed.

## Return (StructuredOutput)
- \`verdict\`: CONVERGED (ship it — at most trivial nits) or CHANGES_REQUESTED.
- \`findings\`: array; each has severity (must-fix / should-fix / nit), location (file:line), problem, and a concrete fix. Be specific; show the line and the failure scenario for any correctness concern.
- \`summary\`: one paragraph.
Only return CONVERGED if there are NO must-fix or should-fix findings. Your output is consumed by an orchestrator.
`

const revisePrompt = (issueNum, prNumber, branch, worktree, verdict) => {
  const blocking = (verdict.findings ?? []).filter(isBlocking)
  const findingsText = blocking
    .map((f, i) => `${i + 1}. [${f.severity}] (${f.location}) ${f.problem}\n   Suggested fix: ${f.fix}`)
    .join('\n')
  return `
You are revising an EXISTING draft PR (#${prNumber}) for GitHub issue #${issueNum} in the \`@twin-digital/monorepo\` (Opus) repo, based on cold-review feedback. The work already exists on disk — you are continuing it, not starting over.

## Workspace
Your worktree \`${worktree}\` already exists on branch \`${branch}\` with the prior work committed and pushed. \`cd "${worktree}"\` and run \`git status\` / \`git log --oneline -5\` to orient. If for some reason the worktree is missing, recreate it: \`git -C /workspace/opus worktree add "${worktree}" ${branch}\` then \`cd "${worktree}" && git pull\`. Work EXCLUSIVELY here.

## Review feedback to ADDRESS (these are blocking — must-fix / should-fix)
${findingsText}

Reviewer summary: ${verdict.summary ?? '(none)'}

## Instructions
- Address EVERY blocking item above. If you believe a finding is wrong, don't silently ignore it — fix it the right way or, if it's genuinely mistaken, leave a brief note in the PR explaining why (the next reviewer sees the PR fresh).
- Do not regress anything the review confirmed correct.
- Keep / update tests so they still cover the behavior. Re-run \`pnpm --filter <pkg> test|lint|typecheck\` (or the appropriate validation for CI-only changes) and FIX failures.
${REPO_CONVENTIONS}
## Commit & push
Commit the revision (conventional message), push to \`${branch}\` (PR #${prNumber} updates automatically). Keep it a DRAFT — do NOT mark it ready.

## Return (StructuredOutput)
Return the schema object: ok (true if revision pushed), prNumber (${prNumber}), prUrl, filesChanged, verification (commands + results), summary (what you changed to address the feedback), notes. Consumed by an orchestrator.
`
}

const finalizePrompt = (issueNum, prNumber, outcome, verdict, rounds) => {
  if (outcome === 'converged') {
    const nits = (verdict.findings ?? []).filter((f) => !isBlocking(f))
    const nitText =
      nits.length ?
        `The review left these optional nits (do NOT fix them — just record them in the comment for the human):\n${nits.map((f) => `- (${f.location}) ${f.problem}`).join('\n')}`
      : 'The review left no outstanding nits.'
    return `
Draft PR #${prNumber} (resolves issue #${issueNum}) has CONVERGED after ${rounds} review round(s): the cold review returned CONVERGED with no blocking findings.

Do exactly this:
1. Post a single PR comment summarizing the agent loop: \`gh pr comment ${prNumber} --body "..."\`. Include: "Resolved by agent implement→review loop (${rounds} round(s)); cold review converged with no blocking findings." then ${nitText}
2. Mark the PR ready for human review: \`gh pr ready ${prNumber}\`.
3. Confirm it is no longer a draft: \`gh pr view ${prNumber} --json isDraft,state\`.
Return a one-line confirmation of the final state.
`
  }
  // gave up after the round cap
  const blocking = (verdict?.findings ?? []).filter(isBlocking)
  return `
Draft PR #${prNumber} (issue #${issueNum}) did NOT converge after ${rounds} review round(s) — the cold review still has blocking findings. It needs a human.

Do exactly this (leave the PR as a DRAFT — do NOT mark it ready):
1. Add a \`needs-human\` label: \`gh pr edit ${prNumber} --add-label needs-human\` (if the label doesn't exist, create it first: \`gh label create needs-human --color B60205 --description "Agent loop could not converge; needs human" 2>/dev/null || true\`, then add it).
2. Post a PR comment listing the unresolved blocking findings so a human can pick up:
${blocking.map((f) => `   - [${f.severity}] (${f.location}) ${f.problem}`).join('\n') || '   - (see review history)'}
   via \`gh pr comment ${prNumber} --body "..."\`.
Return a one-line confirmation.
`
}

// ---------------------------------------------------------------------------
// Per-issue pipeline: implement -> (review -> revise)* -> finalize.
// Issues run concurrently (capped by the workflow runner); each owns a distinct
// branch + worktree, so there is no claiming race — the script is the single
// writer that assigns work.
// ---------------------------------------------------------------------------
const results = await parallel(
  issues.map((issueNum) => async () => {
    const branch = `agent/issue-${issueNum}`
    const worktree = `${WORKTREE_ROOT}/agent-issue-${issueNum}`

    let impl = await agent(implementPrompt(issueNum, branch, worktree), {
      label: `impl:#${issueNum}`,
      phase: 'Implement',
      schema: IMPL_SCHEMA,
    })
    if (!impl) return { issueNum, status: 'implementer-died' }
    if (!impl.ok || !impl.prNumber) {
      return { issueNum, status: 'not-implemented', reason: impl.notes ?? '(no PR opened)' }
    }
    const pr = impl.prNumber

    let round = 0
    let verdict = null
    let converged = false
    while (round < MAX_ROUNDS) {
      round++
      verdict = await agent(reviewPrompt(issueNum, pr, worktree), {
        label: `review:#${issueNum} r${round}`,
        phase: 'Review',
        schema: VERDICT_SCHEMA,
      })
      if (!verdict) return { issueNum, status: 'review-error', pr, rounds: round }
      if (hasConverged(verdict)) {
        converged = true
        break
      }
      if (round >= MAX_ROUNDS) break // out of rounds; fall through to needs-human
      const revised = await agent(revisePrompt(issueNum, pr, branch, worktree, verdict), {
        label: `revise:#${issueNum} r${round}`,
        phase: 'Implement',
        schema: IMPL_SCHEMA,
      })
      if (!revised || !revised.ok) return { issueNum, status: 'revise-failed', pr, rounds: round }
    }

    await agent(finalizePrompt(issueNum, pr, converged ? 'converged' : 'needs-human', verdict, round), {
      label: `finalize:#${issueNum}`,
      phase: 'Finalize',
    })

    return {
      issueNum,
      status: converged ? 'converged' : 'needs-human',
      pr,
      rounds: round,
      blocking: converged ? 0 : (verdict?.findings ?? []).filter(isBlocking).length,
    }
  }),
)

// ---------------------------------------------------------------------------
// Roll-up for the orchestrator / human.
// ---------------------------------------------------------------------------
const clean = results.filter(Boolean)
const summary = {
  converged: clean.filter((r) => r.status === 'converged'),
  needsHuman: clean.filter((r) => r.status === 'needs-human'),
  notImplemented: clean.filter((r) => r.status === 'not-implemented'),
  errored: clean.filter((r) => !['converged', 'needs-human', 'not-implemented'].includes(r.status)),
}
log(
  `Done. converged=${summary.converged.length} needs-human=${summary.needsHuman.length} ` +
    `not-implemented=${summary.notImplemented.length} errored=${summary.errored.length}`,
)
return summary
