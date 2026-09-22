---
name: fix-issues
description: >-
  Resolve one or more GitHub issues end-to-end via an implement → cold-review → converge loop,
  opening a draft PR per issue and marking it ready for human review once the review converges.
  Use when the user asks to "fix issue(s) #N", "work through these tickets", or "implement and
  review issue #N" and hands you a specific list of issue numbers. This is the CORE loop only —
  it does NOT triage or pick issues itself; the caller supplies the numbers.
---

# fix-issues

Drives a deterministic, multi-agent loop that resolves a **caller-supplied list** of GitHub issues
in the `@twin-digital/monorepo` (Opus) repo. For each issue, an implementer agent opens a draft PR,
a fresh **cold** reviewer (no implementation context) critiques it against the issue, and the
implementer revises until the review **converges** — then the PR is marked ready for human review.
Stuck PRs are labeled `needs-human` and left as drafts. The orchestration is a Workflow script so the
control flow (the loop, the round cap, the convergence rule) is deterministic, not model-judged.

## When to use / not use

- **Use** when the user gives you specific issue numbers to resolve and wants PRs opened + iterated to
  a reviewable state with minimal hand-holding.
- **Do NOT use** for triage / "which issues should an agent do" — this skill assumes the issues are
  already known to be agent-suitable. (Each implementer still does a suitability re-check and bails to
  `not-implemented` if a ticket turns out to be a research/decision/infra task — but don't rely on that
  to filter a backlog.)
- **Do NOT use** for a single trivial edit you can just make inline — the loop's value is the
  independent cold review, which is overkill for a one-line change you're confident in.

## How to invoke

This skill is backed by a Workflow script that lives **inside this skill folder**
(`.claude/skills/fix-issues/workflow.js`). It is not in `.claude/workflows/` because that directory is
gitignored (the Workflow tool dumps a scratch copy of every run there); keeping the script in the
skill folder makes it self-contained and version-controlled. Invoke it by **`scriptPath`**, not `name`:

```
Workflow({
  scriptPath: '.claude/skills/fix-issues/workflow.js',
  args: { issues: [123, 145], maxRounds: 3, baseBranch: 'main' }
})
```

(Use the absolute path if your cwd isn't the repo root.)

- `issues` (required): array of issue numbers. A bare array (`args: [123, 145]`) also works.
- `maxRounds` (optional, default 3): max review↔revise rounds before giving up and labeling
  `needs-human`. Keep this small — a PR that hasn't converged in 3 rounds usually needs a human.
- `baseBranch` (optional, default `main`).

Issues run **concurrently** (throttled by the workflow runner). Each issue gets its own branch
(`agent/issue-<n>`) and worktree (`.claude/worktrees/agent-issue-<n>`), so there is no claiming race —
the script is the single writer that assigns work. Because Workflow runs in the background, you'll get
a notification when it completes; relay the roll-up to the user.

## The convergence rule (deterministic)

A PR is **converged** iff the cold reviewer returns `verdict: CONVERGED` **and** raises zero `must-fix`
or `should-fix` findings. `nit`-severity findings do not block — they're recorded in a PR comment for
the human but not fixed in the loop. This is a hard, schema-validated check, not a judgment call.

## What you get back

The workflow returns a roll-up object: `{ converged, needsHuman, notImplemented, errored }`, each an
array of `{ issueNum, status, pr, rounds, ... }`. Relay it plainly:

- **converged** → PR marked **ready for review** (un-drafted), with a summary comment. Human's turn.
- **needs-human** → PR left as a **draft**, labeled `needs-human`, with the unresolved blocking findings
  in a comment.
- **not-implemented** → no PR; the implementer judged the issue not agent-completable (reason in the result).
- **errored** → an agent died or a review/revise step failed mid-loop; the PR (if any) is left as-is.

## Prerequisites & assumptions

- `gh` and `git` authenticated (this devcontainer mints tokens on demand).
- Worktrees are created under `/workspace/opus/.claude/worktrees/` — adjust `WORKTREE_ROOT` in the
  script if the layout differs.
- The repo's conventions (changesets, source-first builds, `.js` import extensions, repo-kit-managed
  config, Prettier) are baked into the agent prompts. If those conventions change, update the
  `REPO_CONVENTIONS` block in `.claude/skills/fix-issues/workflow.js`.
- After the loop, the per-issue worktrees remain on disk (the branches are pushed). Clean them up with
  `git worktree remove` once their PRs are merged/closed.

## Roadmap (intentionally out of scope here)

This is the validated core. Planned follow-ons, to be layered on as separate front-ends:
a **triage** pass that scans untriaged issues and labels them agent-suitable + a complexity tier; a
**dispatcher** that scans the suitable-unclaimed set instead of taking an explicit list; and optional
per-specialty reviewer fan-out (a panel of cold reviewers with distinct lenses) for complex tickets,
with sign-off carried as GitHub **check runs** so it survives across runs and can gate branch protection.
