# Renovate ↔ Changesets Integration

**Status:** specification (under review) · **Owner:** CI/CD · **Related:** [`../CICD.md`](../CICD.md), PR #91 (Renovate config), PR #93 (automation)

This document specifies how automated dependency updates from **Renovate** are reconciled with
this repo's **changesets**-based versioning/publishing. It is the source of truth for the
behavior of the `renovate-changeset` workflow and the supporting Renovate configuration. It is
written to be **referenced during implementation** and used by reviewers to **assess the PR**.

Renovate does not natively create changesets ([renovatebot/renovate#24882](https://github.com/renovatebot/renovate/discussions/24882)).
Without intervention, a dependency bump to a versioned package would merge with **no changeset**,
so changesets would never cut a release reflecting that bump. This integration closes that gap.

---

## 1. Goals & non-goals

**Goals**

1. Every Renovate PR carries exactly **one** changeset that this automation owns, kept correct
   and idempotent across reruns and across a PR that **grows** over time.
2. A versioned package receives a changeset entry **iff** its *published* surface changed
   (runtime / peer / optional dependency closure). devDependency-only and tooling-only updates
   get an **empty** changeset (the change is accounted for, no version bump).
3. The automation never fights Renovate's own branch management, never loops, and never clobbers
   human-authored changesets.

**Non-goals**

- Supporting Renovate's *native* `postUpgradeTasks` (disabled on the Mend-hosted app — see §9).
- Supporting **named pnpm catalogs** — explicitly rejected and guarded against (§8).
- A hard CI gate that *requires* a changeset on dependency PRs — deferred (§10, item “#7”).

---

## 2. Components

| File | Role |
| --- | --- |
| `renovate.json` (PR #91) | Renovate behavior + `gitIgnoredAuthors` so our commits don't block Renovate. |
| `.github/workflows/renovate-changeset.yml` | Trigger, gates, concurrency; runs the generator and commits the result back to the PR branch. |
| `.github/scripts/renovate-changeset.ts` | Pure logic: compute affected packages + bump types from the PR diff, write the managed changeset. Run via Node 24 type-stripping. |
| `.github/scripts/assert-no-named-catalogs.ts` | CI guard (§8): fail the build if named catalogs appear. |
| `docs/cicd/renovate-integration.md` | This spec. |

---

## 3. Expected behavior from Renovate

Configured by `renovate.json` (see PR #91). Salient points for this integration:

- **Branches are in-repo.** The Mend-hosted Renovate app pushes `renovate/*` branches directly
  to `twin-digital/opus` (not forks). This is why the workflow can use the `pull_request` trigger
  with a writable token — see §7.
- **Grouping.** `group:allNonMajor` collapses non-major updates into a **single PR that
  accumulates** bumps over time; majors and security updates open as separate PRs. A grouped PR
  therefore changes (`synchronize`) as Renovate adds/removes bumps — the automation must converge
  on the *current* diff each run, not append.
- **Catalog-routed updates.** Most shared dependencies are referenced as `catalog:` in each
  `package.json`, with versions centralized in `pnpm-workspace.yaml`. Renovate updates the
  **catalog block** in `pnpm-workspace.yaml`; the consuming `package.json` files **do not change**.
  The generator must fan out from catalog changes to consumers (§5.3).
- **Branch updates trigger `synchronize`.** Renovate pushes as its own app identity, so its pushes
  *do* trigger the workflow (this is what makes the integration self-healing — §6.3).
- **`gitIgnoredAuthors`.** Renovate is told to ignore commits authored by
  `github-actions[bot]` so that our changeset commit does **not** mark the PR as
  “edited by user” and freeze Renovate's updates (maintainer-confirmed hazard — §6.2).

---

## 4. The workflow (`renovate-changeset.yml`)

```
on: pull_request (opened, synchronize, reopened)
gate: github.head_ref starts with "renovate/"  AND  github.actor == "renovate[bot]"
concurrency: group per-PR, cancel-in-progress: true
permissions: contents: write
```

Steps:

1. `actions/checkout` the PR head branch, `fetch-depth: 0` (need base history for diffs).
2. `actions/setup-node` from `.nvmrc` (Node 24 → runs `.ts` directly).
3. Run `node .github/scripts/renovate-changeset.ts` (env: `BASE_REF`, `PR_TITLE`, `PR_NUMBER`).
4. **Commit-and-push with retry** (§6.4): if the managed changeset file changed, commit as
   `github-actions[bot]` and push; on a non-fast-forward rejection, re-fetch/rebase and retry
   (bounded). If the file is unchanged, do nothing.

Rationale for the trigger choice (`pull_request`, not `pull_request_target`) is in §7.

---

## 5. Changeset generation algorithm

The generator is **stateless and idempotent**: it derives the desired changeset entirely from the
current PR diff against base, writes a single deterministically-named file, and exits. Same diff →
identical file → no commit.

### 5.1 The managed file

- Path: **`.changeset/renovate-<PR_NUMBER>.md`** (stable per PR — *not* keyed on commit SHA, so
  reruns overwrite in place instead of accumulating files).
- The automation **only ever reads/writes this one path.** All other `.changeset/*.md` (human or
  from other PRs) are left untouched — see §6.5.
- The summary line marks it as managed, e.g.
  `chore(deps): <PR title> — managed by renovate-changeset, do not edit`.

### 5.2 Affected packages (direct)

For each **workspace package** whose own `package.json` changed in the diff, compare the base vs
head copies and collect, per dependency *type*, the set of dependency names that were added,
removed, or had their spec changed:

- `dependencies` (regular runtime)
- `optionalDependencies`
- `peerDependencies`

`devDependencies` changes are recorded but **never** produce a package entry (§5.5).

> New packages (absent at base) are skipped — Renovate does not add packages.

### 5.3 Affected packages (catalog fan-out)

If `pnpm-workspace.yaml` changed, parse the **default `catalog:`** block at base and head and
compute the set of catalog keys whose version spec changed. For each workspace package, for each
catalog key it consumes (value `catalog:`), attribute it to the **dependency type** under which the
package references it (deps / optional / peer) and treat it exactly as a direct change of that type.

Named catalogs (`catalogs:`) are **not** parsed and are rejected by CI (§8).

### 5.4 Bump type policy

Per affected package, the entry's bump type is the **maximum** (major > minor > patch) over all of
its changed runtime/peer/optional dependencies, using:

| Dependency type | Version change | Bump |
| --- | --- | --- |
| `dependencies` | any | **patch** |
| `optionalDependencies` | any | **patch** |
| `peerDependencies` | within same major (e.g. `^18.1` → `^18.4`) | **patch** |
| `peerDependencies` | crosses a major (e.g. `^18` → `^19`) | **major** *(decision — §11)* |

Regular and optional runtime updates are **always patch** by deliberate policy (we prefer a flat,
predictable patch stream that can be batch-released). Peer dependencies are the one consumer-facing
contract: requiring a new **major** of a peer is breaking for downstream consumers, so it escalates
the consuming package's bump. “Crosses a major” is determined by extracting the leading major
integer from each range string and comparing; ambiguous/unparseable ranges fall back to **patch**
(fail-soft) and are logged.

### 5.5 devDependencies and the empty-changeset rule

- A package affected **only** through `devDependencies` is **not** added (dev deps don't change
  published output).
- If, after §5.2–5.4, the affected set is **empty** (a devDependency-only or tooling/CI-only PR),
  the managed file is written as an **empty changeset** — empty frontmatter + summary — so the
  change is still accounted for under the repo's “every change has a changeset” convention, with no
  version bump. This means **every Renovate PR ends with exactly one managed changeset**, entries or
  empty.

### 5.6 Private vs public packages

The repo configures `privatePackages: { version: true, tag: true }`, and existing changesets bump
private packages. Accordingly the generator includes **all** affected workspace packages regardless
of the `private` flag; private packages receive version bumps + git tags (no npm publish). *(See
§11 — reviewers should confirm this, as it produces tag churn on private apps.)*

### 5.7 Output

```
---
'@twin-digital/pkg-a': patch
'@twin-digital/pkg-b': major
---

chore(deps): update dependency react to v19 — managed by renovate-changeset, do not edit
```

Entries are sorted by package name for stable, diff-friendly output.

---

## 6. Lifecycle scenarios & hazards

### 6.1 Initial PR open
Renovate opens a PR (`opened`) → workflow computes affected set → writes
`.changeset/renovate-<PR>.md` → commits + pushes. Renovate ignores the commit (`gitIgnoredAuthors`),
so the PR stays under Renovate's management.

### 6.2 Hazard: foreign commit freezes Renovate *(mitigated)*
Pushing any non-Renovate commit to a Renovate branch normally makes Renovate treat the PR as
user-edited and **stop updating it** (confirmed by a Renovate maintainer in #24882). **Mitigation:**
`gitIgnoredAuthors: ["41898282+github-actions[bot]@users.noreply.github.com"]` in `renovate.json`.

### 6.3 PR grows / Renovate rebases *(self-healing)*
When Renovate adds a bump to a grouped PR, or rebases the branch on a base change, it force-pushes
(as the app) → `synchronize` fires → the workflow **regenerates from the current diff**. Because the
file name is stable and the content is fully recomputed:
- New affected packages appear; removed ones disappear; bump types are recomputed.
- If Renovate's rebase dropped our previous changeset commit, this run re-creates it.

Each dependency that is present in the PR ends up as exactly **one** entry per affected package,
regardless of how many incremental pushes built up the PR.

### 6.4 Hazard: stale push race *(mitigated)*
Renovate may force-push between our checkout and our push, causing a non-fast-forward rejection.
**Mitigation:** the commit-and-push step retries — on rejection it `git fetch` + rebase our single
changeset commit onto the new tip and pushes again, bounded to a few attempts; if it still fails it
exits non-zero (a later `synchronize` from Renovate will re-run the generator anyway). The
`concurrency` group (cancel-in-progress, per-PR) prevents two of our own runs from racing.

### 6.5 Hazard: clobbering human changesets *(mitigated)*
The automation manages exactly one path, `.changeset/renovate-<PR>.md`. It never reads, rewrites, or
deletes any other changeset file. A maintainer may add their own `.changeset/*.md` to a Renovate PR
and it will be preserved; changesets aggregates (takes the max bump per package) at version time, so
an overlapping human entry is harmless.

### 6.6 Hazard: workflow self-loop *(mitigated, defense-in-depth)*
Our push could in principle trigger another `synchronize` → infinite loop. Two independent
mitigations: (a) pushes made with the default `GITHUB_TOKEN` **do not trigger** further workflow
runs (GitHub policy); (b) the generator is **idempotent** — a rerun on an unchanged diff produces an
identical file and commits nothing. Either alone breaks the loop.

### 6.7 Hazard summary

| Hazard | Mitigation | Section |
| --- | --- | --- |
| Foreign commit freezes Renovate | `gitIgnoredAuthors` | 6.2 |
| Renovate drops our changeset on rebase | self-heal via `synchronize` re-run | 6.3 |
| Stale / non-ff push | fetch+rebase retry, bounded; per-PR concurrency | 6.4 |
| Clobbering human changesets | manage only `renovate-<PR>.md` | 6.5 |
| Accumulating stale `renovate-<sha>.md` files | stable PR-keyed filename, full regenerate | 5.1 |
| Workflow self-loop | `GITHUB_TOKEN` no-retrigger + idempotent content | 6.6 |
| Named catalogs silently missed | CI guard fails build | 8 |
| Fork PR can't push | functional no-op (read-only token); documented | 7 |

---

## 7. Security model: `pull_request`, not `pull_request_target`

Community changeset bots often use `pull_request_target` because they must support **fork** and
**Dependabot** PRs, where a plain `pull_request` token is read-only — so they need the elevated
trigger to obtain write access, then bolt on guards to avoid the “pwn request” (privileged execution
of untrusted head code).

We do **not** need it: Renovate's `renovate/*` branches live **in our own repo**, and for same-repo
PRs `pull_request` already grants a read/write `GITHUB_TOKEN`. We thus get write access **without**
the `pull_request_target` attack surface. Additional points:

- The generator only **reads** `package.json` / `pnpm-workspace.yaml` as data and runs `git`
  plumbing; it never executes repo-provided code (no install/build of PR contents), so even the
  residual risk of the same-repo write token is minimal.
- The `github.actor == "renovate[bot]"` gate (defense-in-depth) prevents a human-created
  `renovate/*` branch from triggering the privileged auto-commit.
- **Functional boundary:** a fork PR would run with a read-only token and the push would no-op.
  Renovate never produces fork PRs; if Dependabot or fork-based dependency PRs are ever adopted,
  this must be revisited (the right tool there is `workflow_run`, which this repo already uses for
  deploy/publish — not `pull_request_target`).

---

## 8. Named catalogs are unsupported (and CI-guarded)

### Why
The generator's catalog fan-out (§5.3) parses only the **default** `catalog:` block of
`pnpm-workspace.yaml`. pnpm also supports **named catalogs** under a top-level `catalogs:` key
(referenced as `catalog:<name>`). If a named catalog were introduced:

- A version bump inside `catalogs:` would **not** be detected, so consuming packages would get **no
  changeset** — a silent miss that ships an unreleased dependency change (exactly the failure this
  integration exists to prevent).

Rather than silently under-detect, we **reject named catalogs** at CI time.

### The guard
`.github/scripts/assert-no-named-catalogs.ts`, run as a step in `ci.yaml` (which runs on every
push and on PRs to `main`), fails the build if `pnpm-workspace.yaml` contains a top-level
`catalogs:` key. The failure message links here and reads approximately:

> Named pnpm catalogs (`catalogs:`) are not supported by the Renovate changeset automation and
> would cause dependency updates to ship without a changeset. See
> docs/cicd/renovate-integration.md §8. To use named catalogs, the generator must first be extended
> (see “What support would require” below).

### What support would require
To support named catalogs, the generator (§5.3) must be extended to:

1. Parse **all** catalogs — the default `catalog:` block **and** every entry under `catalogs:`
   (`catalogs.<name>.<dep>: <spec>`), producing a per-`(catalog, key)` version map at base and head.
2. Resolve each package's catalog reference by **name**: a `package.json` value of `catalog:` uses
   the default catalog, while `catalog:foo` uses the named catalog `foo`. Fan out a changed
   `(catalog, key)` only to packages that reference *that* catalog/key under a runtime/peer/optional
   type.
3. Add fixtures/tests covering default + named catalogs, and remove this guard.

Until all three are done, the guard stays.

---

## 9. Why not native `postUpgradeTasks`

Renovate's built-in post-update hook could run `pnpm`/a script to add files to the commit, but it is
**disabled on the Mend-hosted app** for security (arbitrary command execution), and community
reports (#24882) of files being silently ignored confirm it is not a viable path while we use the
hosted app. A CI-side workflow (this design) is the supported approach. If we ever self-host
Renovate, `postUpgradeTasks` running `pnpm` + the generator becomes an option and would remove the
need for the separate workflow.

---

## 10. Out of scope / deferred

- **“#7” — a hard changeset gate.** Today nothing in CI *requires* a changeset, so this automation
  is the only thing keeping releases in step with merged dependency bumps; any heuristic miss ships
  silently. Whether to add a required check (fail a Renovate PR that touches a versioned package's
  runtime closure but has no changeset) is deferred until this lands and we have signal.
- **Named-catalog support** (§8) — intentionally not implemented; guarded instead.
- **Self-hosted Renovate / `postUpgradeTasks`** (§9).

---

## 11. Decisions for reviewers

1. **Peer-major bump type (§5.4).** Proposed: a peer dependency moving to a new major escalates the
   consuming package to **major**. Alternative: **minor**. (Regular/optional stay patch regardless.)
2. **Private package inclusion (§5.6).** Proposed: include private packages (matches
   `privatePackages.version: true` and existing changesets), accepting version+tag churn on private
   apps for routine dependency bumps. Alternative: restrict entries to publishable (non-private)
   packages.
