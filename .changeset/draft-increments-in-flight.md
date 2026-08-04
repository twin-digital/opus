---
'@twin-digital/design-process': minor
---

Draft increments in the merge gate and the fold.

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
