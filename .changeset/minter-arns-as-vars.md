---
---

ci: read the GitHub App minter role ARNs from repo variables (non-sensitive identifiers, alongside the App id and KMS key). The renovate minter runs with no environment, so its OIDC subject is `repo:<owner>/<repo>:pull_request`; publish uses the `release` environment for the `NPM_TOKEN` secret.
