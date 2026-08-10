# @twin-digital/design-process

## 0.10.0

### Minor Changes

- a648679: Implement increment-process increments 032-034: components and scoped foundations, statement
  discipline and terms, and lifecycle unification.

  - New dialects `requirements@3`/`requirement@2`/`decisions@3`/`decision@3`: `components:` and
    `terms:` blocks, `scope:` on requirements, decisions, presets, and terms, `commentary` beside
    the statement, ordered `cases:` on decisions, `supersedes` replacing `amends`, and `retired`
    as the one closure status with a free-text reason. Published sources keep their dialect.
  - Validator: component tree gates (parent resolution, acyclicity, guarded retirement, scope
    resolution), term gates (closure-wide slug uniqueness, guarded retirement), one-declaration-
    per-increment for state entries, statement budgets in the new dialects, retired-preset
    application guard, frozen pool entries, and the fact-retirement debt gate reading the backlog.
  - The check's output now carries two severities: findings gate and set the non-zero exit;
    reports (staleness, term usage heuristics, re-parenting reach) inform and name their product.
    A product's own landing enforces the staleness reports scoped to it.
  - `fact@2`/`run@2` pool dialects with generated `f-`/`run-` ids; each pool file validates
    against the version its wrapper declares; `design-process id` mints `f` and `run` ids.
  - `show`: renders components, terms, and decision cases; `--scope` filters by component subtree;
    `--commentary` includes commentary and is refused at a published fold; `--facet` retires with
    the facets field.
  - The increment session loses no work to a failed GitHub write: notes a refused review could not
    post stay staged for the next submit, and a commit left unpushed by a refused push is pushed
    by the next submit. Rejections in `decisions@3` drafts write their reason as `reason:`.

## 0.9.0

### Minor Changes

- 47f4dff: The ratify session becomes a review session, rendering `/design-process/ratify-screen@4`.

  - The session opens on every draft its pull request carries, whatever statuses that draft's
    entries hold.
  - A requirements list sits beside the decisions list, carrying the requirements the draft
    declares and its model bindings. An entry there takes a note and no ruling, and a
    requirement's pane carries its rationale and its verification steps.
  - Either list marks what an entry closes and what closed it.
  - A submit returns the owner to the list it was made from with the staged set cleared of what
    it wrote; the sitting ends when the owner ends it or a landing completes.
  - A refused push fetches the branch's tip, reapplies the sitting's rulings by entry id, and
    pushes again, leaving an entry the tip already ruled as the tip has it.
  - The header holds two rows whatever it carries, and the detail pane reflows a statement to its
    width and wraps every block it renders, a list item's continuation hanging under its text.
  - Each list ends with the foundations the draft retires in the source it reads, the row carrying
    the retired foundation's title over its id with `retired` where a ruling stands, and the pane
    carrying that foundation's statement recovered from the fold at head beside the retirement's
    reason.
  - The detail pane marks its edge while it holds content back, and a page moves by the pane's own
    height and stops at the content's first and last row, so the whole of an entry's detail is
    reachable.

## 0.8.1

### Patch Changes

- b161513: Land a product's first increment. The landing measures itself against the fold at the head ref, and
  resolving that fold threw where the head declares no such product — which is the state of every
  product's first increment, so no new product could be landed at all. The head having nothing of the
  product is now an answer rather than a failure: there is nothing to conflict with, and the landing
  claims 001. `design-process conflicts` reports the same case as passing rather than erroring.
- 6d13a5b: The ratify session's frame now fits its viewport. No row runs past the terminal's width — the
  header, the detail pane's own rows, and the composed rows are all clipped — so the frame no longer
  soft-wraps, outgrow the rows it was drawn for, and scroll the screen out from under the repaint.

  The footer is rendered, carrying what the last refused action said. The entry list scrolls to keep
  the selected entry inside the pane, and the detail pane's scroll stops at the end of the entry
  rather than paging past it into a blank pane.

## 0.8.0

### Minor Changes

- affeceb: The ratify session works a draft's pull request, and every data command takes `--json`.

  `design-process increment` takes an optional product and `--pr <url>`: it resolves the pull
  request to its head branch, working in place where the tree is already there and in a temporary
  worktree otherwise, and opens one where a branch carrying a draft has none. The draft comes from
  the diff. The ratify list now holds every decision the draft carries in whatever status, beside
  every open question, and `deferred` sits beside the four rulings. What it renders is the authored
  surface `/design-process/ratify-screen@1`, checked by a conformance case.

  A submit writes owner-typed text as a block scalar that round-trips and edits only the spans it
  ruled, commits with a body tallying the statuses it took, pushes, and posts the sitting's notes as
  one `COMMENT` review carrying the owner's token.

  `check`, `show`, `id`, `where`, `diff`, `conflicts`, and the `backlog` subcommands take `--json`;
  their findings and data go to stdout and the progress and warning lines around them to stderr.
  Citations now resolve against requirements in force through an adopted preset, and the projection
  prints a model entry's `surface:` binding.

## 0.7.0

### Minor Changes

- 6f57c00: Products are discovered by scanning `products/` at any depth, so they can be grouped into
  subfolders: a `product.yaml` or `product.yml` declares a product wherever it sits, its directory
  name is the id, and duplicate ids are a validator finding.

  Adds two commands. `design-process increment <product>` is a terminal session that rules a draft's
  proposed decisions and open questions from a master list beside the selected entry's full text,
  stages the rulings, and lands the draft once nothing is open. `design-process land <product>` runs
  the same landing non-interactively: conflicts, the rename into the number, the design check,
  commit, push, opening the pull request where the branch has none, approve, and auto-merge,
  stopping at the first failure. The merge method is read from the repository's own allowed methods
  rather than assumed. The approving token is typed at the terminal and held only in memory.

  `design-process show`'s coverage summary now counts adopted preset requirements and excludes
  proposed decisions, matching what the record validator enforces.

## 0.6.0

### Minor Changes

- 9a80eee: Presets may adopt presets, and adoption is transitive.

  A product's requirements are its own plus those of every preset in the closure its `presets:`
  declarations reach, deduplicated by requirement id, so a preset reached by two paths contributes
  once. `check` no longer refuses a preset that adopts another — a previously blocked tree now
  passes — and instead reports a cycle by the path that closes it, and one preset pinned at two
  versions within a closure. `show` renders the whole closure, naming the presets an indirectly
  reached one came through, and record coverage completeness spans it.

  The preset conflict rule now reads a collision as two declarations in force of one requirement id
  — by the product and a preset in its closure, or by two of those presets. A retired declaration
  does not count, so a requirement can move out of a product into a preset that product adopts.

  The evidence pool tightens alongside. The `version:` wrapper is now the only thing that marks a
  `facts/` or `evidence/` file as a pool file: a bare top-level sequence is artifact material and
  contributes no entries, so a probe fixture that happens to be a sequence no longer loads as runs
  and fails entry validation. A file that does not parse as YAML is reported as a finding rather
  than dropped unseen, which had taken its facts and runs out of the pool with no signal. And a
  run's recorded `output` must exist in the tree whether or not a fact cites the run yet, so a
  broken output surfaces in the commit that breaks it.

## 0.5.0

### Minor Changes

- 9eb0ee9: Enforce the facts/evidence bar in `design-process check`.

  `check` now validates the repo-wide `facts/` and `evidence/` pools: entry and wrapper shape against the pool schemas, the backing's source floor, per-source locators and verbatim quotes (in-repo urls and run outputs read from the tree), run-source resolution, `artifacts/` sources backing only tested facts, `superseded_by` resolution, and id uniqueness across the shared fact/run namespace. The loader accepts both the current bare sequences and the later `{version, facts|runs: [...]}` wrappers.

## 0.4.0

### Minor Changes

- b6062c1: Draft increments in the merge gate and the fold.

  An increment being worked lives at `products/<product>/increments/wip-<NNN>-<slug>/` on its own
  branch. The ordinal orders the drafts one tree holds and claims no published number; landing
  renames the directory into the next published number before the merge.

  - `check` reads a draft increment as it is worked: its sources validate against their schemas,
    its citations resolve, and its proposed decisions and open questions are reported — every
    per-increment rule applied to it as to a published increment. The wip directory always draws
    the `increment-dir-name` finding, so `check` never exits 0 while a draft is in flight, and the
    landing rename is what clears it. Two drafts sharing an ordinal draw the new
    `draft-ordinal-unique` finding.
  - The density gate, record coverage completeness, and the change rules stay on published
    numbers. A wip ordinal neither fills a gap nor makes one, and an implementation record folds
    at its numeric target with drafts excluded, so it lands cleanly in a tree holding one.
  - `show` with no fold version folds the tree as it stands, drafts after every published
    increment in ordinal order — their foundations in the fold, their supersessions closing what
    they name, and their claims counted in the coverage summary. A draft shows under its directory
    name. Naming a version with `--at` or `--at-ref` projects published state and leaves drafts
    out, as `where` and `diff` do.
  - `conflicts` covers a draft increment at its wip directory, alongside the directories numbered
    above the head.

  A directory beginning `wip-` that misses the grammar is not a draft increment: it draws the
  `increment-dir-name` finding worded for the wip form, and its sources are read by nothing.

  `IncrementRef = number | string` joins the entry point's exports — a published number, or a
  draft increment's directory name. `FoldedClaim`, `OutOfForce`, `AddedClaim`, and `ClosedClaim`
  carry it, and `Fold` gains `label` and `drafts`. The change widens the surface and breaks no
  consumer.

## 0.3.0

### Minor Changes

- 2c5567b: The backlog, parallel drafting, and a single entry point.

  New commands:

  - `backlog add|list|search|show|update|delete|send` works a product-keyed markdown backlog on
    an orphan `backlog` branch. Writes go through git plumbing, so capturing an item never
    touches the working tree or the checked-out branch. `send` copies an item into an
    increment's `drafts/backlog/` and drops it from the branch in one action.
  - `where <product> [--at <increment> | --at-ref <gitref>] [--next]` names the product's latest
    published increment at a fold version, or the number a landing would claim.
  - `diff <product>` with a `--from` and an optional `--to` reports the foundations added,
    amended, superseded, and retired between two folds.
  - `conflicts <product> [--against <increment> | --against-ref <gitref>]` runs the landing check
    against the fold at head, exiting non-zero on an id the head already declares or a closure
    aimed at an entry already closed.

  A fold version is two parameters, not one: the bare parameter names an increment and its
  `-ref` counterpart names a git ref, and giving both is an error. `show` gains `--at-ref`
  alongside `--at`. An increment argument takes padding or not — `--at 9` and `--at 009` name the
  same increment — because nothing is inferred from an argument's form.

  `parseFoldVersion` changes shape with them: it reads a flag pair rather than sniffing a single
  argument, and the `FoldVersionFlags` type joins the entry point's exports.

  The package exports a single `.` entry point. The `./*` subpath wildcard is gone, so modules
  under `src/` are no longer importable and internal structure is free to move.

## 0.2.0

### Minor Changes

- e239529: Support the `deferred` decision status (decisions sources at version 2). A deferred decision
  stays in force for citations but is not coverable: `check` rejects a coverage entry naming one
  (`record-covers-deferred`) and no longer counts an omitted deferral as a coverage gap, and
  `show` counts deferred entries beside the rulings while excluding them from the coverage
  section, its summary naming how many were excluded.

## 0.1.0

### Minor Changes

- 28d30fe: Initial release: `design-process check` (the design merge-gate validator), `design-process
show` (the folded product projection), and `design-process id` (the opaque-id generator).
