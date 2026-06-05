# Renovate ↔ Changesets Integration

**Status:** Active — signed commits via an OIDC-minted App token; auto-merge gated on a required "changeset present" check · **Owner:** CI/CD · **Related:** [`../CICD.md`](../CICD.md), [`./github-app-token-minting.md`](./github-app-token-minting.md), PR #91 (Renovate config), PR #93 (automation), #110 (KMS-signed App tokens)

This document describes how automated dependency updates from **Renovate** are reconciled with this
repo's **changesets**-based versioning/publishing — the `renovate-changeset` workflow and the
`@twin-digital/renovate-tools` package.

Renovate does not natively create changesets ([renovatebot/renovate#24882](https://github.com/renovatebot/renovate/discussions/24882)).
Without intervention, a dependency bump to a versioned package merges with **no changeset**, so
changesets never cut a release reflecting that bump. This integration closes that gap.

The first half is what a contributor needs day to day; **Design & internals** below is for whoever
maintains the automation itself.

---

# For developers

## How it works, end to end

1. Renovate opens or updates a PR on a `renovate/*` branch (a dependency or `catalog:` bump).
2. The `renovate-changeset` workflow runs and compares every workspace package's **effective
   published dependency ranges** against the base branch.
3. It writes **one** file, `.changeset/renovate-<PR>.md`, listing which packages changed and their
   bump (`patch`, or `major` for a peer crossing a major) — or an **empty** changeset if nothing
   publishable changed.
4. It commits that file back to the PR. Renovate ignores the commit (via `gitIgnoredAuthors`), so it
   keeps managing the PR.
5. When the PR merges, changesets consumes the file like any other and includes the bump in the next
   release.

A dependency that appears or disappears (Renovate occasionally adds or removes one) counts as a
change → `patch`.

## Worked example: how the bump is chosen

A catalog bump raises `react` from `^18` to `^19`. Three packages consume it differently:

- **pkg-a** — `peerDependencies: { react: "catalog:" }` → the peer crosses a major → **major**.
- **pkg-b** — `devDependencies: { react: "catalog:" }` → devDeps don't change published output → **no entry**.
- **pkg-c** — `dependencies: { react: "catalog:" }` → runtime dep → **patch**.

The generated `.changeset/renovate-<PR>.md`:

```
---
'pkg-a': major
'pkg-c': patch
---

chore(deps): update react to v19
```

(pkg-b is absent.) Full rules: §4.3.

## FAQ

- **I see `.changeset/renovate-<PR>.md` on a Renovate PR — should I edit it?**
  No. It's regenerated from scratch on every run, so edits are overwritten. To change the result,
  add your *own* changeset (next question).
- **Can I add my own changeset to a Renovate PR?**
  Yes. Add a separate `.changeset/<name>.md`; the automation only manages `renovate-<PR>.md` and
  never touches yours. At release, changesets takes the **max bump per package**, so a higher human
  bump wins (§6.5).
- **Why did a major upstream bump release as only a `patch`?**
  By design — regular/optional dependency updates are flat `patch`; the dependency's real magnitude
  is in the changeset summary. See §9.
- **The Renovate PR's changeset is empty — is that a bug?**
  No. devDependency-only and in-range updates don't change published ranges, so the changeset is
  intentionally empty (the change is still recorded).
- **I got a `::warning::` / errored annotation on a Renovate PR — now what?**
  The tool couldn't parse a manifest or `pnpm-workspace.yaml`, or hit a catalog misconfiguration, so
  it wrote **nothing** rather than risk a wrong changeset. Read the annotation and fix the
  manifest/catalog — the same issue usually also fails `pnpm install --frozen-lockfile` — then let
  the next push re-run it (§4.4).

---

# Design & internals (for CI/CD maintainers)

## 1. Goals & non-goals

**Goals**

1. Every Renovate PR carries exactly **one** automation-owned changeset, correct and idempotent
   across reruns and across a PR that **grows** over time.
2. A package receives a changeset entry **iff** its **effective published dependency ranges**
   changed (§4). Updates with no published-range change (devDep/tooling-only, or in-range relocks)
   get an **empty** changeset.
3. The automation never fights Renovate's branch management, never loops, and never clobbers
   human-authored changesets.

**Non-goals**

- Reacting to resolution-only changes (overrides, `patchedDependencies`, `lockFileMaintenance`
  relocks) — these don't change a published package's declared ranges (§4).
- Supporting Renovate's native `postUpgradeTasks` (disabled on the Mend-hosted app — §8).
- A hard CI gate that *requires* a changeset (deferred).

---

## 2. Components

| Path | Role |
| --- | --- |
| `tooling/renovate-tools/` | `@twin-digital/renovate-tools` (`private: true`): the detection logic + CLI. Repo-kit-managed (tsconfig/eslint/vitest); dep `yaml`; run via `tsx`. **No `@pnpm/*` deps.** |
| `.github/workflows/renovate-changeset.yml` | **Caller** (untrusted half): `pull_request` trigger, `renovate/*` + actor gate, concurrency. Delegates to the reusable workflow pinned `@main`. |
| `.github/workflows/_renovate-mint-commit.yml` | **Reusable** (trusted, `@main`-pinned): OIDC→KMS mints an App token, runs the CLI, commits the changeset **signed via the GitHub API** (§5, §7). |
| `merge-checks.yaml` → `renovate-changeset-present` job | Required check: a `renovate/*` PR must carry its managed changeset before it can merge — gates auto-merge (§6.8). (In `merge-checks`, not `ci.yaml`: it's a PR-merge gate, not an every-push build.) |
| AWS minter role (`secrets.GH_APP_MINTER_ROLE_ARN_RENOVATE`) | `kms:Sign`-only; OIDC trust pinned to the reusable workflow `@main` + `actor == renovate[bot]` (§7). |
| `renovate.json` (PR #91) | Renovate behavior + `gitIgnoredAuthors` + `automerge` (§6.2, §6.8). |
| `docs/cicd/renovate-integration.md` | This reference. |

The **detection** logic is self-contained in `@twin-digital/renovate-tools` and supports named
catalogs natively (§4.1). The **commit** path is split into a thin untrusted caller and a `@main`-pinned
reusable workflow so the privileged token mint can't be redirected by a tampered PR (§7).

---

## 3. Expected behavior from Renovate

Configured by `renovate.json` (PR #91):

- **Branches are in-repo.** The Mend-hosted app pushes `renovate/*` branches directly to
  `twin-digital/opus` (not forks) — why the workflow can use `pull_request` with a writable token (§7).
- **Grouping.** `group:allNonMajor` collapses non-major updates into a **single PR that accumulates**
  bumps over time; majors/security open separately. A grouped PR changes (`synchronize`) as Renovate
  adds/removes bumps, so the automation must converge on the *current* state each run, not append.
- **Catalog-routed updates.** Most shared deps are referenced as `catalog:` in each `package.json`,
  with versions centralized in `pnpm-workspace.yaml`. A catalog bump changes `pnpm-workspace.yaml`
  but **not** the consuming `package.json` files — detection must resolve `catalog:` to compare
  effective ranges (§4.1).
- **`rangeStrategy` (default `auto`).** Most in-range minor/patch updates change only the lockfile,
  not the declared range — so they correctly produce no changeset. Floor-raising and exact/catalog
  bumps change the effective range and are detected.
- **Renovate pushes trigger `synchronize`** (it pushes as its own app identity), which makes the
  integration self-healing (§6.3).
- **`gitIgnoredAuthors`** is set to our bot email so our changeset commit doesn't mark the PR as
  "edited by user" and freeze Renovate (§6.2).

---

## 4. Detection model

The core idea: **the lockfile isn't published — consumers resolve a package's *declared ranges*
against their own tree.** So a package needs a changeset iff its **effective published dependency
ranges** changed. That is the complete, semver-correct signal for published packages, and it
naturally ignores resolution-only churn (overrides/relocks) that doesn't affect consumers. This is
the canonical rationale referenced from §1, §3, and §9.

The tool is **stateless and idempotent**: it derives everything from the current working tree vs a
single base ref, writes one deterministically-named file, and exits. Same state → identical file →
no commit.

### 4.1 Effective published ranges

For each workspace package, build the effective range of every `dependencies`,
`optionalDependencies`, and `peerDependencies` entry (`devDependencies` are ignored — they don't
change published output):

- Read the manifest with `JSON.parse`.
- A `catalog:` / `catalog:default` / `catalog:<name>` value is resolved to the catalog's range, which
  is what pnpm publishes in its place. Resolution is **hand-rolled** against catalogs we parse
  ourselves from `pnpm-workspace.yaml` with the `yaml` library (no `@pnpm/*` dependency):
  - Parse `pnpm-workspace.yaml` into `{ default: <top-level catalog>, ...<named catalogs> }`.
  - **`catalog:` and `catalog:default` both reference the `default` catalog** (pnpm normalizes the
    empty name to `default`); `catalog:<name>` references the named catalog.
  - A `catalog:` reference with no matching entry, or whose resolved value is itself a `catalog:`
    (recursive), is a **misconfiguration** → routed to the error path (§4.4), never silently treated
    as "unchanged."

Why hand-rolled rather than pnpm's own libraries: `@pnpm/workspace.read-manifest` is directory-only
and cannot read the base revision's content (which we have only as `git show` output), and
`@pnpm/catalogs.resolver` is an explicitly-unstable internal package (decoupled `major×100`
versioning, no stability guarantee). Its ~15-line substitution is cheaper to own and test; the full
rationale lives in the `catalog.ts` header comment.

### 4.2 Diff against a single base ref

Compute every workspace package's effective ranges at the **base** (`git show origin/BASE:<path>`)
and at **head** (the working tree), and diff. There is **no `git diff --name-only` gating** — diffing
all packages against one base ref by construction avoids any merge-base-vs-tip baseline mismatch.

Per `(package, depType, depName)`:

- present on **both** sides → changed iff the effective ranges differ.
- present on **one** side only (Renovate occasionally adds/removes a dep) → changed; magnitude
  unknowable → `patch`. Compare must tolerate `undefined` without throwing.
- **New package** (base `package.json` absent): `git show` **fails** (non-zero) → skip; Renovate
  never adds packages. This is distinguished from *present-but-unparseable* by `git show`'s exit
  status, **not** by empty output (§4.4).

### 4.3 Bump policy

Per affected package, the entry is the **max** (`major` > `patch`) over its changed deps:

| Dependency type | Change | Bump |
| --- | --- | --- |
| `dependencies` / `optionalDependencies` | any | **patch** |
| `peerDependencies` | within the same major | **patch** |
| `peerDependencies` | crosses a major (`^18` → `^19`) — literal, `catalog:`, or named-`catalog:` | **major** |

Regular/optional updates are **flat patch** by deliberate policy (predictable, batch-releasable,
kind to downstream consumers). Peers are the one consumer-facing contract: requiring a new **major**
peer is breaking for consumers, so it escalates. "Crosses a major" compares the leading major integer
of each effective range; an unparseable range falls back (safely) to `patch`. The catalog'd /
named-catalog'd peer case only works because §4.1 resolves the peer's `catalog:` at **both** base and
head (including named catalogs).

### 4.4 The managed changeset & error handling

**File:** `.changeset/renovate-<PR_NUMBER>.md` — stable per PR (not keyed on commit SHA, so reruns
overwrite in place). The automation reads/writes **only this path**; all other `.changeset/*.md`
(human or other PRs) are untouched (§6.5). The summary is the **PR title verbatim** (the filename
marks it as managed; no boilerplate leaks into changelogs). Entries sorted by package name.

**Three distinct outcomes — never conflate them:**

1. **Confidently non-empty** — ≥1 package affected → write the changeset with entries.
2. **Confidently empty** — parsing succeeded and nothing publishable changed (devDep/tooling-only or
   in-range relock) → write an **empty** changeset (`---\n---\n\n<summary>`), so every Renovate PR
   ends with exactly one managed changeset.
3. **Errored** — any parse/resolve exception (base or head, `package.json` or `pnpm-workspace.yaml`,
   or a catalog misconfiguration) → emit a `::warning::` annotation and **write nothing** (leave the
   managed file as-is); exit 0 (fail-open, never blocks Renovate).

The critical rule (§4.2): there is **no `safeJson(...) → {}` fallback**. In the effective-range
model, treating a failed base parse as "no deps at base" would make every head dep look *added* →
a spurious, authoritative `patch`-everything changeset. A throw must route to the **errored** path,
never masquerade as a clean (empty or full) result.

**Soft consistency tripwire:** if a **runtime-consumed** catalog entry changed but the affected set
is empty, warn — by construction the consumer's effective range should have changed too, so this
firing signals a real inconsistency (scoped to runtime consumers to avoid devDep-only false
positives).

### 4.5 Private packages

`changeset` config sets `privatePackages: { version: true, tag: true }` and existing changesets bump
private packages, so the tool includes **all** affected workspace packages regardless of `private`;
private packages get version bumps + git tags (no npm publish). Accepted tradeoff: every Renovate bump
re-tags affected private packages.

---

## 5. The workflows (caller + reusable)

The commit must be **signed** (branch protection requires it) and must **re-trigger the PR checks**
(so the auto-merge gate re-runs on the commit that carries the changeset). A local `git commit` is unsigned,
and a `GITHUB_TOKEN` push triggers nothing — so we commit through the GitHub API with a short-lived
**GitHub App token minted via OIDC→KMS** (the same mechanism as `publish.yaml`; see
[`./github-app-token-minting.md`](./github-app-token-minting.md)). API commits are signed
("Verified"); App-token events *do* re-trigger workflows.

The privileged half lives in its own reusable workflow so it can be **pinned**:

```
caller  renovate-changeset.yml   on: pull_request; gate: head_ref renovate/* AND actor==renovate[bot]
                                 concurrency: per-PR, cancel-in-progress:false; permissions: id-token+contents:write
                                 → uses: …/_renovate-mint-commit.yml@main  (the @main pin is load-bearing — §7)
reusable _renovate-mint-commit.yml  on: workflow_call
```

Reusable steps:

1. **`actions/checkout`** (`fetch-depth: 0`, ref: head).
2. **Hand-rolled setup with `pnpm install --ignore-scripts`** (same SHA pins as `./.github/actions/setup`,
   but *not* the composite). This job mints a privileged token, so a bumped dependency's lifecycle
   script must never execute here; `tsx`/`yaml` need no postinstall.
3. **Generate** the changeset: `git fetch origin $BASE_REF`, then the CLI via `tsx`.
4. **Mint** (only *after* install/generate, so no creds are present while third-party code is on disk):
   `configure-aws-credentials` (OIDC) → assume the `kms:Sign`-only minter role → sign the App JWT →
   exchange for an installation token scoped to **`opus` / `contents:write` only**.
5. **Commit via `createCommitOnBranch`** (signed): `expectedHeadOid` pins the write to the tip we saw —
   a stale tip (Renovate force-pushed) fails the mutation and we re-sync + regenerate + retry (§6.4).
   The commit author is the App identity, which **must equal** `gitIgnoredAuthors`; the step asserts it
   and warns on drift (§6.2).

Trigger rationale (`pull_request`, not `pull_request_target`) and the minting trust model are in §7.

---

## 6. Lifecycle scenarios & hazards

### 6.1 Initial PR open
Renovate opens a PR → caller gates → reusable computes the affected set → writes
`.changeset/renovate-<PR>.md` → commits it via the GitHub API, **signed** (§6.7). Renovate ignores
the commit (`gitIgnoredAuthors`), so the PR stays managed; the App-token commit re-triggers the PR
checks, which re-runs the auto-merge gate (§6.8).

### 6.2 Hazard: foreign commit freezes Renovate *(mitigated)*
A non-Renovate commit on a Renovate branch normally makes Renovate treat the PR as user-edited and
**stop updating it** (maintainer-confirmed, #24882). **Mitigation:** `gitIgnoredAuthors:
["290907000+twin-digital-agent[bot]@users.noreply.github.com"]` (the App identity that mints/commits)
— and it **must equal** the commit author the API produces exactly (§10). The reusable step asserts
this on every run and warns on drift.

### 6.3 PR grows / Renovate rebases *(self-healing)*
When Renovate adds a bump or rebases (force-push, as the app), `synchronize` fires → the workflow
**regenerates from current state**. New affected packages appear, removed ones disappear, bumps
recompute; a dropped changeset is re-created. Each dep ends as exactly one entry per affected
package, regardless of how many incremental pushes built the PR.

### 6.4 Hazard: stale tip race *(mitigated)*
Renovate may force-push between our checkout and write-back. **Mitigation:** `createCommitOnBranch`
with `expectedHeadOid` pinned to the checked-out tip — if the branch moved, the mutation fails (it
never overwrites unseen work) and we re-fetch, hard-reset, **regenerate**, and retry (bounded); on
exhaustion exit non-zero (a later `synchronize` re-heals). `concurrency` uses
**`cancel-in-progress: false`** so a run isn't SIGTERM'd mid-commit. (`expectedHeadOid` is what makes
the write transactional; concurrency only serializes.)

### 6.5 Hazard: clobbering human changesets *(mitigated)*
The automation manages exactly `.changeset/renovate-<PR>.md` and never touches other changeset files.
A maintainer's own changeset is preserved; changesets takes the max bump per package, so an
overlapping entry is harmless.

### 6.6 Hazard: workflow self-loop *(mitigated, defense-in-depth)*
The App-token commit **does** re-trigger workflows (intentionally — it re-runs the §6.8 gate on the
commit that carries the changeset). The loop is still bounded: (a) that re-trigger's `synchronize`
has `actor == twin-digital-agent[bot]`, not `renovate[bot]`, so the **caller's gate skips** it — no
second mint/commit; (b) the tool is idempotent — an unchanged state writes an identical file and
commits nothing. Either alone breaks the loop.

### 6.7 Hazard: unsigned commit rejected by branch protection *(mitigated)*
Branch protection **requires signed commits**; a local `git commit` from Actions is unsigned and is
rejected as unverified. **Mitigation:** commit via the GitHub API (`createCommitOnBranch`), which
GitHub signs server-side ("Verified") — no GPG/SSH key to provision or rotate. The signing token is
the OIDC→KMS-minted App token (§7).

### 6.8 Hazard: auto-merge races the changeset *(mitigated)*
With `automerge: true`, native auto-merge could merge Renovate's original commit **before** the
changeset is added. **Mitigation:** the required `renovate-changeset-present` check (a
`merge-checks.yaml` job — it's a PR-merge gate, not an every-push build) fails on a `renovate/*` PR
until `.changeset/renovate-<PR>.md` exists. Auto-merge waits for it; it only goes green after the
App-token commit lands (which re-triggers the PR checks). This is also why the commit uses an App
token rather than `GITHUB_TOKEN` — the latter wouldn't re-run the gate on the new head.

### 6.9 Hazard summary

| Hazard | Mitigation |
| --- | --- |
| Foreign commit freezes Renovate | `gitIgnoredAuthors` (exact App-identity email) |
| Renovate drops changeset on rebase | self-heal via `synchronize` |
| Stale tip / concurrent force-push | `expectedHeadOid` + regenerate-retry; `cancel-in-progress: false` |
| Clobbering human changesets | manage only `renovate-<PR>.md` |
| Stale per-commit changeset files | stable PR-keyed name (`renovate-<PR>.md`), full regenerate |
| Workflow self-loop | caller actor-gate skips the App commit + idempotent content |
| Unsigned commit rejected (signed-commits rule) | commit via GitHub API → "Verified" (§6.7) |
| Auto-merge merges before changeset | required `renovate-changeset-present` check (§6.8) |
| Privileged mint redirected by a tampered PR | OIDC trust pinned to reusable `@main` + `actor` (§7) |
| Parse failure → spurious changeset | errored path: annotate + write nothing (§4.4) |
| Fork PR mints/pushes | forks get no `id-token` and can't push (§7) |

---

## 7. Security model: `pull_request`, not `pull_request_target`

Community changeset bots use `pull_request_target` to get a writable token for **fork**/**Dependabot**
PRs, then guard against the "pwn request." We don't need it: Renovate's `renovate/*` branches are
**in-repo**, so `pull_request` runs with secrets and `id-token: write` available. Also: the tool only
**reads** manifests/YAML as data and runs `git` plumbing (never executes PR code); the
`actor == renovate[bot]` gate is defense-in-depth; and a fork PR gets **no `id-token`** (so it can't
mint) and can't push (functional boundary — if Dependabot/fork PRs are ever adopted, use
`workflow_run`, not `pull_request_target`).

### 7.1 Minting trust (OIDC → KMS)

The signed commit needs an App token (§5). It is minted exactly like `publish.yaml`: GitHub OIDC →
assume a **dedicated, `kms:Sign`-only** AWS role → sign the App JWT → exchange for an installation
token scoped to **`opus` / `contents:write` only** (narrower than publish's). The App private key
never leaves KMS.

The role's trust is what bounds who can mint. AWS only honors a fixed set of GitHub OIDC claims as
condition keys (notably **not** `head_ref`), so we scope on what works and is observable:

- `repository == twin-digital/opus` and `actor == renovate[bot]` — only Renovate-triggered runs.
  (Empirically, Renovate's events carry `actor: renovate[bot]`; a human/agent who pushes to a
  `renovate/*` branch triggers as themselves, so the condition fails and nothing mints.)
- `job_workflow_ref == …/_renovate-mint-commit.yml@refs/heads/main` — the **load-bearing** pin. The
  caller always invokes the reusable workflow as `@main`, so the reusable job's `job_workflow_ref`
  resolves to that exact file on `main`. A `pull_request` runs the *caller* from the PR head, so a PR
  could edit the caller — but it can only ever mint by calling this `@main` file, whose contents a PR
  cannot change. (`pull_request`'s own `sub`/`ref` are branch-agnostic — `…:pull_request` /
  `refs/pull/N/merge` — which is why we pin on `job_workflow_ref`, not `sub`.)

Defense in depth: forks can't mint (no `id-token`); `pnpm install --ignore-scripts` keeps a bumped
dependency from executing in the job; the role can do nothing but `kms:Sign` one key; the token is
`contents:write` on one repo. The exact `job_workflow_ref` value is confirmed from the reusable
workflow's first-run claim log before the role trust is locked to `StringEquals`.

---

## 8. Why not native `postUpgradeTasks`

Renovate's post-update hook could add files to the commit, but it is **disabled on the Mend-hosted
app**, and community reports (#24882) confirm files being silently ignored. A CI-side workflow is the
supported path. If we ever self-host Renovate, `postUpgradeTasks` running the CLI becomes an option.

---

## 9. Known limitations

- **Flat-patch semver.** All regular/optional updates emit `patch` by deliberate choice — a
  floor-raising major dep bump ships as a `patch`. The changeset summary carries the real magnitude
  (PR title) even when the bump is `patch`. The bump policy is swappable (see §4.3).
- **Direct-deps-only scope.** Transitive changes are not inspected.
- **Resolution-only changes produce no changeset.** Overrides, `patchedDependencies`, and
  `lockFileMaintenance` relocks change resolution but not declared ranges — correct for published
  packages (§4). **Accepted residual:** a *private deployed app* whose deployed deps shift via an
  override/relock won't get a changeset (bookkeeping only; deploys happen regardless).

---

## 10. Activation prerequisite

The base integration (#91 config, #93 automation) is already live. Moving to **signed commits +
auto-merge** has an ordered rollout, because the AWS trust must match the reusable workflow's real
`job_workflow_ref` (§7):

1. **Merge this PR** so `_renovate-mint-commit.yml` exists on `main` and its first run logs the exact
   `job_workflow_ref`/`actor` claims. (Until the role exists, the mint step fails *visibly* but
   doesn't block — `renovate-changeset` isn't a required check.)
2. **Create the AWS role + secret:** a `kms:Sign`-only role with trust pinned to that
   `job_workflow_ref@refs/heads/main` + `actor == renovate[bot]` + `repository`; add it as
   `GH_APP_MINTER_ROLE_ARN_RENOVATE` (§7).
3. **Set `gitIgnoredAuthors`** to `290907000+twin-digital-agent[bot]@users.noreply.github.com` (the
   App identity that now authors the commit) — it **must equal** the API commit author exactly or the
   freeze hazard returns (§6.2). The reusable step asserts this and warns on drift.
4. **Make `renovate-changeset-present` a required status check**, then set `automerge: true` in
   `renovate.json` (§6.8). Order matters: enabling auto-merge before the gate is required would let a
   PR merge without its changeset.
