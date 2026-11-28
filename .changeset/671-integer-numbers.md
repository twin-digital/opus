---
'@thrashplay/wishem-hub': patch
---

The hub side refuses a `hello` or a `submit` as malformed when `protocol` or `request` is not an integer from 0 to 2^53 - 1.
