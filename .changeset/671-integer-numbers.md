---
'@thrashplay/wishem-hub': patch
---

The hub side refuses a `hello` or a `submit` as malformed when `protocol` or `request` is not an integer from 0 to 2^53 - 1. The client side does not accept a `refused` message when a number of `supported` is not such an integer: it closes the link with the error "The hub side sent no welcome message."
