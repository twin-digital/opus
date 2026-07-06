---
'@twin-digital/credential-shelf': patch
---

Fix the refresh-listener failing to bind with `EACCES` on a fresh deployment. Pre-create and chown `/run/credential-shelf` (the listener's default socket dir) to the vendor uid in the image, so a fresh `trigger-sock` named volume mounted there inherits uid-1000 ownership instead of defaulting to root — otherwise the uid-1000 listener can't create its Unix socket and the fronting trigger gets connection failures (502s).
