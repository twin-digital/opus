---
'@thrashplay/wishem-pixi-page': patch
---

The PixiJS page server prints one short line when no construct answers the link. It prints no Vite stack trace at each retry. A reset of the link by the browser prints nothing. A plain HTTP request to `/link` gets status 502.
