---
'@grinbox/server': minor
'@grinbox/shared': minor
'@grinbox/web': minor
---

Double the seeded cap on model calls to 100 per ten minutes, and bring the startup reconcile into line with it: a seeded cap whose bound this release has changed now moves to the shipped value instead of keeping whatever was first written. The user's own caps are a different origin and are untouched.
