---
'@twin-digital/lock-link': patch
---

Fix Lynx login: the wire field is `email`, not `username`. The client was sending `{ username, password }` which Lynx rejected with `400 Bad request`, meaning every scheduled tick failed at the first `login` call. Also: when login fails, include the response body in the thrown `LynxApiError` so a future misconfiguration doesn't hide behind a generic message. The fake now models Lynx's `400` on a missing `email` field so this class of bug can't slip past tests again.
