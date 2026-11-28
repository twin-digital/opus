---
'@thrashplay/wishem-hub': patch
---

`webSocketChannel` closes the socket one time when the socket sends an `error` event after the open.
