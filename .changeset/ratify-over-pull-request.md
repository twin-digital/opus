---
'@twin-digital/design-process': minor
---

The ratify session works a draft's pull request, and every data command takes `--json`.

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
