# Supply-chain scanning for dependency PRs

**Status:** Active — Socket.dev GitHub App as a required PR check, gating Renovate auto-merge · **Owner:** CI/CD · **Related:** [`../CICD.md`](../CICD.md), [`./renovate-integration.md`](./renovate-integration.md), issue #118 (this control), #116 (build-script PR isolation), #79 (per-env OIDC roles)

This document describes the **detection** layer that inspects dependency changes before they merge:
the [Socket.dev](https://socket.dev) GitHub App, wired as a **required status check** so Renovate
only auto-merges a dependency bump once the package has actually been examined.

---

# Why a scanner, on top of the cooldown

Renovate's existing controls — `minimumReleaseAge: 5 days` + `internalChecksFilter: strict` — are
purely **time-based**. They delay a bump until a version has been public for five days, on the bet
that most malicious versions are reported and yanked within that window. That bet is reasonable, but
the cooldown **inspects nothing**: it never looks at the package. Enabling auto-merge removes the
human-merge gate for the low-risk bulk, so without detection an auto-merged dependency reaches the
publish (`NPM_TOKEN`, KMS) and deploy (AWS) credentials with no one having looked at what changed.

The threat the cooldown does not address has two arms:

- **Install scripts** (`postinstall`, …) — run at `pnpm install` time, including in CI. We allowlist
  these via pnpm `onlyBuiltDependencies` and isolate their bumps into separate, non-auto-merged,
  reviewed PRs (#116) — but the scripts still execute.
- **Runtime payloads** — malicious code in the package body, executed during `build`/`test`/deploy.
  Affects **every** dependency, scripts or not; entirely outside the `onlyBuiltDependencies` story.

A scanner closes the gap the cooldown leaves: it inspects the package.

## Known-advisory vs behavioral — why Socket

Dependency scanners split into two kinds, and only one addresses the threat above:

- **Known-advisory** (GitHub Dependency Review, Dependabot, OSV-Scanner, Trivy, `pnpm audit`) match
  your lockfile against an advisory database (CVE / GHSA / OSV). They flag malware **only after** it
  has been reported and curated — the same blind spot as the cooldown, by a different mechanism. They
  cannot see a freshly-published malicious version, and they do not inspect install scripts at all
  (Trivy's npm parser has no notion of a `scripts` field; OSV is a pure database lookup).
- **Behavioral** (Socket.dev) inspect the package *body and manifest*: install scripts, network/shell
  access, obfuscated code, `eval`, environment-variable access, typosquatting, and AI-flagged
  malware. This is the only camp that can flag **novel / zero-day** supply-chain malware — which is
  precisely what the cooldown cannot.

Socket was chosen as the behavioral layer: it deploys as a GitHub App (no workflow YAML), understands
`pnpm-lock.yaml`, exposes a native required check, and its threat-research team has a public track
record of discovering real npm supply-chain attacks. An independent academic benchmark
([arXiv 2603.27549](https://arxiv.org/abs/2603.27549)) measured behavioral detectors at high
**precision** (~97–98%) — the property that matters for a gate, since a false positive blocks a
legitimate dependency PR. Detection is heuristic, not a guarantee (see Limitations).

# Defense in depth

The scanner is one layer of several; each covers a failure mode the others do not:

| Layer | Control | Covers |
| --- | --- | --- |
| **Time** | `minimumReleaseAge: 5 days` cooldown | Most malicious versions are yanked before we even see them — but inspects nothing |
| **Detection** | **Socket.dev required check** (this doc) | Novel install-script / runtime malware in the actual package |
| **Review / blast-radius** | Build-script PR isolation (#116) | Bumps to `onlyBuiltDependencies` are split out and never auto-merged, so script-running changes get a human |
| **Least privilege** | Per-env OIDC roles (#79) | Bounds what an exposed credential can do if a payload does run |

The cooldown is also synergistic with the scanner: the extra days give Socket (and the wider
community) time to flag a bad version before it is ever eligible to auto-merge.

# How it gates auto-merge

The Socket GitHub App posts **two** checks on each PR, and only one is the gate:

- **`Socket Security: Pull Request Alerts`** — the **gate**. It analyzes only the dependencies a PR
  *introduces or changes* (the diff), so a Renovate bump scans a handful of packages, not the tree.
- **`Socket Security: Project Report`** — an **informational** full-dependency-tree (SBOM) report.
  Not a merge gate.

Configure **`Socket Security: Pull Request Alerts`** as a **required status check** on `main`; it
blocks merge until it passes. Renovate, by default,
[will not auto-merge until it sees passing status checks for the branch](https://docs.renovatebot.com/key-concepts/automerge/) —
so the required check is, transitively, an auto-merge gate. No `renovate.json` change is needed for
the gating itself.

**Free-tier note.** Socket's self-serve free tier caps dependencies per scan and **truncates the
full `Project Report`** for a large monorepo. That cap lands on the informational full-tree report —
**not** on the `Pull Request Alerts` gate, which scans only the small per-PR delta. The
qualifying-open-source free Team account (requested separately) lifts the cap and restores full
reports; until then the gate still functions on the delta. Confirm on the first real (multi-bump)
Renovate PR that its `Pull Request Alerts` scan is not itself truncated before relying on it as a
required check.

## Block vs. warn policy

Whether an alert **fails** the check (block) or only **comments** (warn) is set in the Socket
dashboard's org **Security Policy** (per alert: Block / Warn / Monitor / Ignore) — a UI, not in-repo
config. Socket ships sensible **defaults** (known-malware and the high-severity categories block out
of the box), so the gate has teeth before any tuning. For this repo's threat model, also set the
install-script / network+shell-access / obfuscation / typosquat categories to **block**; lower-signal
categories warn. Editing the policy (and the full reports) may require the open-source Team account;
the default policy applies meanwhile. Nothing here needs a commit to change it.

## Caveat: the check must report on every PR

A required status check that never reports leaves a PR **stuck pending**. Before marking the Socket
check required, confirm it reports a passing status on a PR that changes **no** dependencies (open a
docs-only PR and watch the check go green, not pending). If it only reports on dependency-changing
PRs, do **not** mark it required as-is — unrelated PRs would wedge. This is the same hazard the
`renovate-changeset-present` job was designed around (it no-ops to success on every non-Renovate PR);
the Socket check must behave equivalently.

# Activation order

Order matters, the same way it does for the Renovate signed-commit rollout
([`renovate-integration.md` §10](./renovate-integration.md)): the gate must be **required before**
auto-merge is enabled, or a PR could auto-merge ungated.

1. **Install the Socket GitHub App** on the repo (read-only; repo-scoped is sufficient). Free for
   public repos.
2. **Set the block/warn security policy** in the Socket dashboard (above).
3. **Let Socket run once** on an open PR so GitHub registers the
   `Socket Security: Pull Request Alerts` check name.
4. **Validate** the no-dependency-PR behavior (above).
5. **Make `Socket Security: Pull Request Alerts` a required status check** on `main`.
6. **Only then** enable Renovate `automerge: true` (tracked separately — this control is its
   prerequisite). Enabling auto-merge before the check is required would let a PR merge ungated.

# Limitations

- **Heuristic, not a proof.** Behavioral detection has false negatives and is bypassable; it raises
  the cost of an attack, it does not eliminate it. It is a layer, not a guarantee — which is why the
  cooldown, build-script isolation, and least-privilege roles all stay.
- **Known-CVE coverage is not its job.** Socket targets novel/behavioral risk; it is not a
  vulnerability-advisory scanner. If we later want a known-CVE/license gate too, the native
  `actions/dependency-review-action` (free on public repos, pure workflow YAML) is the complement —
  the two cover disjoint failure modes.
- **Third-party trust surface.** Socket is a SaaS app with **read** access to repo metadata and
  dependency manifests (analysis runs on Socket's side; it does not touch secrets or deploy
  credentials). Scope the install to this repo to minimize the surface.
