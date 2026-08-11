---
'@twin-digital/design-process': minor
---

feat(design-process): facts carry a title and may be cited bare

A fact with an opaque `f-<id>` resolves whether it is cited bare or with the `f:` prefix — same
rules, same messages, same retirement checks. Slug-id facts keep the prefix as their only spelling.
A fact may also carry an optional `title`, shown wherever a fact is rendered; without one, the
first line of its claim stands in as before.
