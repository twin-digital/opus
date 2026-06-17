---
'@twin-digital/repo-kit': patch
---

The write-file sync action now creates missing parent directories, so features can write into subdirectories (e.g. `eslint.config.d/`).
