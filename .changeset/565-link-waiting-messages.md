---
'@thrashplay/wishem-hub': patch
---

A channel gives all waiting messages to a new listener, also when the listener throws for one of them. The first error goes to the caller of `onMessage`.
