# Renovate ↔ Changesets Integration

**Status:** specification · **Owner:** CI/CD · **Related:** [`../CICD.md`](../CICD.md), PR #91 (Renovate config), PR #93 (automation)

This document specifies how automated dependency updates from **Renovate** are reconciled with this
repo's **changesets**-based versioning/publishing. It is the source of truth for the
`renovate-changeset` workflow and the `@twin-digital/renovate-tools` package.

Renovate does not natively create changesets ([renovatebot/renovate#24882](https://github.com/renovatebot/renovate/discussions/24882)).
Without intervention, a dependency bump to a versioned package merges with **no changeset**, so
changesets never cut a release reflecting that bump. This integration closes that gap.

---

## 1. Goals & non-goals

**Goals**

1. Every Renovate PR carries exactly **one** automation-owned changeset, correct and idempotent
   across reruns and across a PR that **grows** over time.
2. A package receives a changeset entry **iff** its **effective published dependency ranges**
   changed (see §5). Updates with no published-range change (devDep/tooling-only, or in-range
   relocks) get an **empty** changeset.
3. The automation never fights Renovate's branch management, never loops, and never clobbers
   human-authored changesets.

**Non-goals**

- Reacting to resolution-only changes (overrides, `patchedDependencies`, `lockFileMaintenance`
  relocks). The lockfile isn't published, so these don't change what a published package delivers —
  see §10.
- Supporting Renovate's native `postUpgradeTasks` (disabled on the Mend-hosted app — §9).
- A hard CI gate that *requires* a changeset (deferred — §10).

---

## 2. Components

| Path | Role |
| --- | --- |
| `tooling/renovate-tools/` | `@twin-digital/renovate-tools` (`private: true`): the detection logic + CLI. Repo-kit-managed (tsconfig/eslint/vitest); dep `yaml`; run via `tsx`. **No `@pnpm/*` deps.** |
| `.github/workflows/renovate-changeset.yml` | Trigger, gates, concurrency; runs the CLI and commits the managed changeset back. |
| `renovate.json` (PR #91) | Renovate behavior + `gitIgnoredAuthors` so our commits don't freeze Renovate (§6.2). |
| `docs/cicd/renovate-integration.md` | This spec. |

There is **no** `.github/scripts/*` and **no** named-catalog CI guard — named catalogs are supported
natively (§5.1).

---

## 3. Expected behavior from Renovate

Configured by `renovate.json` (PR #91):

- **Branches are in-repo.** The Mend-hosted app pushes `renovate/*` branches directly to
  `twin-digital/opus` (not forks) — why the workflow can use `pull_request` with a writable token (§8).
- **Grouping.** `group:allNonMajor` collapses non-major updates into a **single PR that accumulates**
  bumps over time; majors/security open separately. A grouped PR changes (`synchronize`) as Renovate
  adds/removes bumps, so the automation must converge on the *current* state each run, not append.
- **Catalog-routed updates.** Most shared deps are referenced as `catalog:` in each `package.json`,
  with versions centralized in `pnpm-workspace.yaml`. A catalog bump changes `pnpm-workspace.yaml`
  but **not** the consuming `package.json` files — detection must resolve `catalog:` to compare
  effective ranges (§5.1).
- **`rangeStrategy` (default `auto`).** Most in-range minor/patch updates change only the lockfile,
  not the declared range — so they correctly produce no changeset. Floor-raising and exact/catalog
  bumps change the effective range and are detected.
- **Renovate pushes trigger `synchronize`** (it pushes as its own app identity), which makes the
  integration self-healing (§7.3).
- **`gitIgnoredAuthors`** is set to our bot email so our changeset commit doesn't mark the PR as
  "edited by user" and freeze Renovate (§6.2 / §7.2).

---

## 4. Detection model

The core idea: **the lockfile isn't published — consumers resolve a package's *declared ranges*
against their own tree.** So a package needs a changeset iff its **effective published dependency
ranges** changed. That is the complete, semver-correct signal for published packages, and it
naturally ignores resolution-only churn (overrides/relocks) that doesn't affect consumers.

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

We parse the workspace YAML ourselves (robustly, with `yaml` — not a regex). `@pnpm/workspace.read-manifest`
is filesystem/directory-only and cannot read the base revision's content (which we have only as
`git show` output), so it does not fit; and `@pnpm/catalogs.resolver` is an explicitly-unstable
internal package (decoupled `major×100` versioning, no stability guarantee) whose ~15-line
substitution we own and test instead.

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

Per affected package, the entry is the **max** (major > minor > patch) over its changed deps:

| Dependency type | Change | Bump |
| --- | --- | --- |
| `dependencies` / `optionalDependencies` | any | **patch** |
| `peerDependencies` | within the same major | **patch** |
| `peerDependencies` | crosses a major (`^18` → `^19`) — literal, `catalog:`, or named-`catalog:` | **major** |

Regular/optional updates are **flat patch** by deliberate policy (predictable, batch-releasable,
kind to downstream consumers). Peers are the one consumer-facing contract: requiring a new **major**
peer is breaking for consumers, so it escalates. "Crosses a major" compares the leading major integer
of each effective range; an unparseable range falls back to `patch` and is logged. The catalog'd /
named-catalog'd peer case only works because §4.1 resolves the peer's `catalog:` at **both** base and
head (including named catalogs).

### 4.4 The managed changeset & error handling

**File:** `.changeset/renovate-<PR_NUMBER>.md` — stable per PR (not keyed on commit SHA, so reruns
overwrite in place). The automation reads/writes **only this path**; all other `.changeset/*.md`
(human or other PRs) are untouched (§7.5). The summary is the **PR title verbatim** (the filename
marks it as managed; no boilerplate leaks into changelogs). Entries sorted by package name.

**Three distinct outcomes — never conflate them:**

1. **Confidently non-empty** — ≥1 package affected → write the changeset with entries.
2. **Confidently empty** — parsing succeeded and nothing publishable changed (devDep/tooling-only or
   in-range relock) → write an **empty** changeset (`---\n---\n\n<summary>`), so every Renovate PR
   ends with exactly one managed changeset.
3. **Errored** — any parse/resolve exception (base or head, `package.json` or `pnpm-workspace.yaml`,
   or a catalog misconfiguration) → emit a `::warning::` annotation and **write nothing** (leave the
   managed file as-is); exit 0 (fail-open, never blocks Renovate).

The critical rule (§4.2/§4.4): there is **no `safeJson(...) → {}` fallback**. In the effective-range
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
private packages get version bumps + git tags (no npm publish). Accepted (§12), with the tag-churn
tradeoff documented.

---

## 5. The workflow (`renovate-changeset.yml`)

```
on: pull_request [opened, synchronize, reopened]
gate: head_ref starts with "renovate/"  AND  actor == "renovate[bot]"
concurrency: per-PR, cancel-in-progress: false   # serialize write-backs (§7.4)
permissions: contents: write
```

Steps:

1. **`actions/checkout`** (`fetch-depth: 0`, ref: head) — **before** the setup composite, which does
   *not* check out the repo.
2. **`./.github/actions/setup`** — SHA-pinned `pnpm/action-setup` + `setup-node` (from `.nvmrc`) +
   `pnpm install`. Reusing it (vs rolling our own) satisfies the SHA-pinning standard from #90.
3. **`git fetch origin ${BASE_REF}`** — so `git show origin/BASE:<path>` resolves.
4. Run the CLI via `tsx` (env `BASE_REF`, `PR_TITLE`, `PR_NUMBER`).
5. **Commit & push with rebase-retry** (§7.4): if the managed file changed, commit as
   `github-actions[bot]` and push; on non-fast-forward, fetch+rebase the single changeset commit and
   retry (bounded). Unchanged → no commit.

Runtime is `tsx` (no build); the `pnpm install` from the composite is the only added cost vs the
original dependency-free path — acceptable for CI. Trigger rationale (`pull_request`, not
`pull_request_target`) in §8.

---

## 6. (reserved)

---

## 7. Lifecycle scenarios & hazards

### 7.1 Initial PR open
Renovate opens a PR → workflow computes affected set → writes `.changeset/renovate-<PR>.md` →
commits + pushes. Renovate ignores the commit (`gitIgnoredAuthors`), so the PR stays managed.

### 7.2 Hazard: foreign commit freezes Renovate *(mitigated)*
A non-Renovate commit on a Renovate branch normally makes Renovate treat the PR as user-edited and
**stop updating it** (maintainer-confirmed, #24882). **Mitigation:** `gitIgnoredAuthors:
["41898282+github-actions[bot]@users.noreply.github.com"]` — and it **must equal** the workflow's
commit-author email exactly (§11).

### 7.3 PR grows / Renovate rebases *(self-healing)*
When Renovate adds a bump or rebases (force-push, as the app), `synchronize` fires → the workflow
**regenerates from current state**. New affected packages appear, removed ones disappear, bumps
recompute; a dropped changeset is re-created. Each dep ends as exactly one entry per affected
package, regardless of how many incremental pushes built the PR.

### 7.4 Hazard: stale push race *(mitigated)*
Renovate may force-push between our checkout and push (non-ff). **Mitigation:** fetch + rebase the
single changeset commit and retry, bounded; on exhaustion exit non-zero (a later `synchronize`
re-heals). `concurrency` uses **`cancel-in-progress: false`** so a write-back run isn't SIGTERM'd
mid-push — runs serialize and the in-flight push completes. (Concurrency *serializes*; it does not by
itself make pushes transactional.)

### 7.5 Hazard: clobbering human changesets *(mitigated)*
The automation manages exactly `.changeset/renovate-<PR>.md` and never touches other changeset files.
A maintainer's own changeset is preserved; changesets takes the max bump per package, so an
overlapping entry is harmless.

### 7.6 Hazard: workflow self-loop *(mitigated, defense-in-depth)*
(a) `GITHUB_TOKEN` pushes don't trigger further workflow runs; (b) the tool is idempotent — a rerun
on unchanged state writes an identical file and commits nothing. Either alone breaks the loop.

### 7.7 Hazard summary

| Hazard | Mitigation |
| --- | --- |
| Foreign commit freezes Renovate | `gitIgnoredAuthors` (exact email) |
| Renovate drops changeset on rebase | self-heal via `synchronize` |
| Stale / non-ff push | fetch+rebase retry; `cancel-in-progress: false` |
| Clobbering human changesets | manage only `renovate-<PR>.md` |
| Stale `renovate-<sha>.md` accumulation | stable PR-keyed filename, full regenerate |
| Workflow self-loop | `GITHUB_TOKEN` no-retrigger + idempotent content |
| Parse failure → spurious changeset | errored path: annotate + write nothing (§4.4) |
| Fork PR can't push | read-only token no-op (documented, §8) |

---

## 8. Security model: `pull_request`, not `pull_request_target`

Community changeset bots use `pull_request_target` to get a writable token for **fork**/**Dependabot**
PRs, then guard against the "pwn request." We don't need it: Renovate's `renovate/*` branches are
**in-repo**, so `pull_request` already grants a writable `GITHUB_TOKEN` — write access without the
elevated attack surface. Also: the tool only **reads** manifests/YAML as data and runs `git`
plumbing (never executes PR code); the `actor == renovate[bot]` gate is defense-in-depth; and a fork
PR runs read-only and no-ops (functional boundary — if Dependabot/fork PRs are ever adopted, use
`workflow_run`, which this repo already uses, not `pull_request_target`).

---

## 9. Why not native `postUpgradeTasks`

Renovate's post-update hook could add files to the commit, but it is **disabled on the Mend-hosted
app**, and community reports (#24882) confirm files being silently ignored. A CI-side workflow is the
supported path. If we ever self-host Renovate, `postUpgradeTasks` running the CLI becomes an option.

---

## 10. Known limitations

- **Flat-patch semver.** All regular/optional updates emit `patch` by deliberate choice — a
  floor-raising major dep bump ships as a `patch`. The changeset summary carries the real magnitude
  (PR title) even when the bump is `patch`. (Bump policy is swappable; see the design discussion on
  range-delta alternatives.)
- **Direct-deps-only scope.** Transitive changes are not inspected.
- **Resolution-only changes produce no changeset.** Overrides, `patchedDependencies`, and
  `lockFileMaintenance` relocks change resolution but not declared ranges — correct for published
  packages (the lockfile isn't published). **Accepted residual:** a *private deployed app* whose
  deployed deps shift via an override/relock won't get a changeset (bookkeeping only; deploys happen
  regardless).

---

## 11. Activation prerequisite

Enable the automation only after **both** #91 and #93 merge. Renovate stays in onboarding (no
dependency PRs) until #91 merges, so there is no window where the workflow runs without
`gitIgnoredAuthors` — **provided the onboarding PR is merged, not closed.** `renovate.json`'s
`gitIgnoredAuthors` **must equal** `41898282+github-actions[bot]@users.noreply.github.com` (the
workflow's commit-author email); a mismatch silently reintroduces the freeze hazard (§7.2).

---

## 12. Decisions (resolved)

1. **Detection signal.** ✅ Effective published dependency ranges (manifest + resolved catalog), **not
   the lockfile** — semver-correct for published packages and avoids relock churn.
2. **Catalog resolution.** ✅ Hand-rolled against catalogs we parse ourselves with `yaml`; **no
   `@pnpm/*` dependency** (the resolver is an unstable internal package; its ~15-line substitution is
   owned and tested).
3. **Package home & runtime.** ✅ `tooling/renovate-tools` (`private: true`), run via `tsx` after the
   SHA-pinned `setup` composite.
4. **Bump policy.** ✅ Flat `patch` for regular/optional; peer cross-major → `major`.
5. **Private packages.** ✅ Included (matches `privatePackages.version: true`), accepting tag churn.
6. **Named catalogs.** ✅ Supported natively (no guard).
7. **Private-app resolution gap.** ✅ Documented and accepted (§10).
