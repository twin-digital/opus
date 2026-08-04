# @twin-digital/design-process

Tooling for the twin-digital incremental design process: the merge-gate validator, the
projection, the opaque-id generator, the cross-increment backlog, and the fold resolver and
diff. The process itself is defined by the documents shipped from the
[plan-opus](https://github.com/twin-digital/plan-opus) repository under `docs/`.

## Usage

Every command takes `--root <dir>` (default `.`) naming the repository root.

```sh
design-process check [--base <ref>] [--static-only]
design-process show <product> [--at <increment> | --at-ref <gitref>] [--facet <facet>]
design-process id <r|d|q> [--count <n>]

design-process where <product> [--at <increment> | --at-ref <gitref>] [--next]
design-process diff <product> (--from <increment> | --from-ref <gitref>)
                              [--to <increment> | --to-ref <gitref>] [--json]
design-process conflicts <product> [--against <increment> | --against-ref <gitref>]

design-process backlog add <product> [--title <text>] [--tag <tag>]... [--file <path>]
design-process backlog list [--product <id>] [--tag <tag>]... [--json]
design-process backlog search <query> [--product <id>] [--tag <tag>]... [--json]
design-process backlog show <id>
design-process backlog update <id> [--title <text>] [--tag <tag>]... [--add-tag <tag>]...
                                   [--remove-tag <tag>]... [--file <path>] [--product <id>]
design-process backlog delete <id>...
design-process backlog send <increment-dir> [--item <id>]... [--product <id>] [--tag <tag>]...
```

### Fold versions

Wherever a command takes a fold version it takes **two parameters, not one**: the bare parameter
names an increment, and its `-ref` counterpart names a git ref — `--at` and `--at-ref`, `--from`
and `--from-ref`, `--to` and `--to-ref`, `--against` and `--against-ref`. Giving both members of
a pair is an error.

An increment parameter takes the number with or without padding: `--at 9`, `--at 09`, and
`--at 009` are the same increment. A ref parameter takes anything git resolves — `--at-ref main`,
`--at-ref origin/main`, `--at-ref 3f2a1c0` — and folds at the product's latest published
increment there.

### Draft increments

An increment being worked lives at `products/<product>/increments/wip-<NNN>-<slug>/` on its own
branch — `wip-`, a three-digit ordinal, then a slug. The ordinal orders the drafts one tree holds
and claims no published number; landing renames the directory into the next published number
before the merge, and `main` never holds one.

The tooling reads a draft increment as it is worked, so an author sees what is wrong before
landing rather than after. Which reader sees one:

| reader                      | draft increments                                                               |
| --------------------------- | ------------------------------------------------------------------------------ |
| `check`                     | read — every per-increment rule applies to a draft as to a published increment |
| `show` with no fold version | folded, after every published increment, in ordinal order                      |
| `show --at` / `--at-ref`    | excluded — an asked-for version names published state                          |
| `where`, `diff`             | excluded                                                                       |
| `conflicts`                 | read on the draft side; the head it compares against is published state        |

A directory that begins `wip-` and does not match the grammar is not a draft increment: it draws
the `increment-dir-name` finding worded for the wip form, and its sources are read by nothing.
`wip-1-slug`, `wip-abc`, `wip-001`, `wip-001-`, and `wip-0001-slug` each miss it.

One tree holds more than one draft increment only when they are stacked, and then the ordinals
are their relative order — `wip-001` lands before `wip-002`. Ordinals need not be dense: when an
ancestor lands, the dependent keeps the ordinal it has. Two drafts that are not ancestor and
dependent are not supported in one tree; work in a fresh worktree instead. Nothing in a checkout
distinguishes that case from a legal stack, so the tooling reports only what it can see — two
drafts sharing an ordinal, which carry no relative order.

### check

Applies every design rule in force to the repository tree; any finding blocks the merge. Exits
non-zero when findings exist. Two rule groups run:

- **Tree-state rules** — pool identity and `$ref` resolution, schema validation of every
  structured file against the pool schema its `version` names, id format and uniqueness, no
  `proposed` decisions, no open questions, citations resolve (never to a question, and no in-force `because:` or `informed_by:` rests on a retired fact), model
  bindings resolve, preset adoption rules, dense increment numbering, implementation-record
  naming and claim scope, and record coverage completeness — every requirement and ruled
  decision in force at the record's target, adopted preset requirements included; deferred
  decisions are excluded, and no coverage entry may name one.
- **Draft-increment rules** — a `wip-<NNN>-<slug>` directory always draws the
  `increment-dir-name` finding, so `check` never exits 0 while a draft increment is in flight;
  the landing rename clears it and nothing else does. Two drafts sharing an ordinal draw
  `draft-ordinal-unique`. Every other per-increment rule reads a draft as it reads a published
  increment. Three readings stay on published numbers: the density gate (a wip ordinal neither
  fills a gap nor makes one), record coverage completeness (a record folds at its numeric target
  with drafts excluded, so it lands cleanly in a tree holding one), and the change rules.
- **Change rules** — compared against `--base` (default `origin/main`, then `main`): published
  increments are immutable, shipped implementation records are immutable, pool versions bound by
  a published increment are immutable (directly or through a bound schema's `$ref`), and a new
  implementation record targets the newest published increment.

Findings cite the requirement or decision id each rule enforces, e.g.:

```
✖ [published-immutable] products/demo/increments/001/decisions.yaml: edited in a published increment (r-caao9k3z)
```

### show

Renders the folded, effective state of a product at an increment as markdown: requirements
(local and adopted), decisions ordered by `because:` topology with statuses and pins (deferred
entries counted beside the rulings), model bindings, coverage joined from the
`implementations/` pool with uncovered and attestation-only counts (deferred decisions
excluded, the summary naming how many), and what the increment changed.

With no fold version asked for it renders the tree as it stands, draft increments folded after
the published ones in ordinal order: their foundations appear, their supersessions close what
they name, and the coverage summary counts their claims. A draft shows under its directory name,
holding no number until it lands — `# demo @ wip-003-third-thing`. Naming a version with `--at`
or `--at-ref` projects published state and leaves drafts out.

### id

Generates opaque ids — `{r|d|q}-` plus 8 random lowercase base36 characters — unique against
every id mentioned under `products/`. Backlog ids (`b-`) are minted by `backlog add`, not here.

### where

Prints the product's latest published increment, zero-padded to three digits and nothing else, so
it drops into a shell substitution. It reads the working tree by default, `--at-ref` another git
ref. `--next` prints the number a landing would claim instead — `001` for a product with no
increments yet. Without `--next`, a product that has published nothing there exits non-zero.

```sh
$ design-process where increment-process
011
$ design-process where increment-process --at-ref origin/main --next
012
```

### diff

Reports what changed between two versions of a product's fold: the foundations added, the
requirements amended, the decisions superseded, and the entries retired. One of `--from` or
`--from-ref` is required; the later fold defaults to the working tree, so `--from 010` alone
answers "what has this branch changed since 010". Empty sections are omitted; `--json` emits the
same delta as structured data.

```
# increment-process: 009 → 011

## added (22)

- r-hbihi1xh (010) [requirement] — future work has a home outside any increment
...
## superseded (1)

- d-aaaaaaaa (011) by d-cccccccc
```

### conflicts

Checks a draft's rulings against the fold at head before it lands: an id the head already
declares, and an `amends:`, `supersedes:`, or `retires:` aimed at an entry the head has already
closed. The head defaults to `origin/main`, then `main`; name another with `--against-ref`, or an
increment with `--against`. It covers every increment directory carrying no published number — a
draft increment at its wip directory among them — and every directory numbered above the head.
Overlap the tooling cannot see —
two drafts ruling the same choice under different ids — is the owner's scan of open drafts.
Findings print in `check`'s shape and exit non-zero.

### backlog

Future work captured outside any increment. Items live on an orphan `backlog` branch, one file
per item at `<product>/<id>.md`, and every write commits to that branch and pushes it to the
remote — using git plumbing, so the working tree and the checked-out branch are untouched.
`--no-push` commits locally; `--offline` skips the fetch that refreshes the local view;
`--remote <name>` names the remote (default `origin`).

An item is free markdown. Its first heading is the title, and optional YAML frontmatter carries
`tags` and nothing else. `add` takes the body from stdin or `--file` (`-` for stdin); give
`--title` to head an untitled body, or begin the body with a heading and omit it.

`list` and `search` print one item per line — id, product, title, tags — with the product always
present. `search` matches ids, titles, and bodies case-insensitively. `--tag` repeats and
requires every tag named. `--json` emits id, product, title, and tags as structured data.

`show` prints one item's markdown, frontmatter stripped.

`update` revises an item in place, keeping its id: `--title` replaces the first heading,
`--file` replaces the body, `--tag` replaces the tag set outright while `--add-tag` and
`--remove-tag` adjust it, and `--product` moves the item to another product.

`delete` drops one or more items by id; an id the backlog does not hold fails the whole command
and writes nothing.

`send` copies the selected items into `<increment-dir>/drafts/backlog/<id>.md` and deletes them
from the branch in the same action, printing `<id>\t<path>` per item. The target is a
repo-relative `products/<product>/increments/<name>` — a draft increment's wip directory as
readily as a numbered increment. Select with `--item` (repeatable), `--product`, or `--tag`; at least one is
required.

```sh
$ design-process backlog add increment-process --title "index the backlog by tag" --tag tooling
b-sqdqsq1l
$ design-process backlog list
b-sqdqsq1l  increment-process  index the backlog by tag  tooling
$ design-process backlog send products/increment-process/increments/wip-001-fold-cache --tag tooling
b-sqdqsq1l	products/increment-process/increments/wip-001-fold-cache/drafts/backlog/b-sqdqsq1l.md
```

#### Concurrent writes

Two people writing the backlog at once race for the branch. The loser's push is rejected; the
tool puts the local branch back, refetches the tip, re-applies the change over what the winner
left, and pushes again — so neither item is lost and no manual recovery is needed. Four attempts
are made by default. When they all fail the command exits non-zero, saying the branch moved, and
the local branch is left exactly where it started.

## Importing the package

The package ships one entry point. Its named exports are the operations behind the subcommands —
`validateTree`, `projectProduct`, `generateIds`, `resolveFold`, `diffFolds`,
`findLandingConflicts`, and the backlog operations — with the types their signatures name.
Everything else under `src/` is implementation and moves freely between versions.

An increment names itself with `IncrementRef = number | string`: a published number, or a draft
increment's directory name. `FoldedClaim`, `OutOfForce`, `AddedClaim`, and `ClosedClaim` carry it,
and a `Fold` reports `label` — the last increment folded — beside `drafts`, the draft directory
names folded in ordinal order. `at` remains the published increment the fold is taken at.

```ts
import { diffFolds, renderFoldDiff, resolveFold } from '@twin-digital/design-process'

const from = resolveFold('.', 'increment-process', { kind: 'increment', number: 9 })
const to = resolveFold('.', 'increment-process')
process.stdout.write(renderFoldDiff(diffFolds('increment-process', from.fold, to.fold)))
```
