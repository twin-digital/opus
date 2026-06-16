---
'@twin-digital/credential-shelf': patch
---

Ship `import-app-private-key` in the credential-shelf image — the one-time tool that imports a GitHub App's RSA key into KMS as a non-extractable signing key (adds `jq`; on PATH as `import-app-private-key`). Salvaged from the retiring `skleinjung/devcontainers` toolkit.
