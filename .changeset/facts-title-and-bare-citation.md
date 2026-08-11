---
'@twin-digital/design-process': minor
---

feat(design-process): facts carry a title and may be cited bare; the pane names scope and cases

A fact with an opaque `f-<id>` resolves whether it is cited bare or with the `f:` prefix — same
rules, same messages, same retirement checks. Slug-id facts keep the prefix as their only spelling.
A `fact@3` entry may carry an optional `title`, shown wherever a fact is rendered; without one, the
first line of its claim stands in as before.

The ratify session's detail pane now names the scope an entry is ruled under, one component per
line with its description, and renders a decision's cases beneath the statement they qualify, in
the form `design-process show` already prints.
