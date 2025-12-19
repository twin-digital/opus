---
'@twin-digital/bookify-cli': minor
'@twin-digital/bookify': minor
---

bookify: replace loose render functions with a unified engine

- operates on a project model
- handles 'watch' functionality internally
- normalizes configuration of options for renderers via env variables
- update CLI to use new API

BREAKING: all previous commands removed from CLI, and replaced with 'html' and 'pdf'
