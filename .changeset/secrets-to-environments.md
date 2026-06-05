---
---

ci: target the `release` and `renovate-mint` environments so their secrets resolve. After moving `NPM_TOKEN`/`GH_APP_MINTER_ROLE_ARN` into the `release` environment and `GH_APP_MINTER_ROLE_ARN_RENOVATE` into `renovate-mint`, the publish and renovate-changeset workflows must declare those environments to read the secrets — otherwise they resolve empty. The renovate minter now reads its role ARN directly from the `renovate-mint` environment (a reusable-workflow caller job can't declare an environment).
