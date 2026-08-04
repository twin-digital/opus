---
'@twin-digital/design-process': minor
---

Presets may adopt presets, and adoption is transitive.

A product's requirements are its own plus those of every preset in the closure its `presets:`
declarations reach, deduplicated by requirement id, so a preset reached by two paths contributes
once. `check` no longer refuses a preset that adopts another — a previously blocked tree now
passes — and instead reports a cycle by the path that closes it, and one preset pinned at two
versions within a closure. `show` renders the whole closure, naming the presets an indirectly
reached one came through, and record coverage completeness spans it.

The preset conflict rule now reads a collision as two declarations in force of one requirement id
— by the product and a preset in its closure, or by two of those presets. A retired declaration
does not count, so a requirement can move out of a product into a preset that product adopts.

Two evidence-pool rules tighten alongside. A `facts/` or `evidence/` file that does not parse as
YAML is reported as a finding rather than dropped unseen, which had taken its facts and runs out
of the pool with no signal. And a run's recorded `output` is now required to exist in the tree
whether or not a fact cites the run yet, so a broken output surfaces in the commit that breaks it.
