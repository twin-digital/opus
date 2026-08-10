---
'@twin-digital/design-process': minor
---

Implement increment-process increments 032-034: components and scoped foundations, statement
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
