---
---

ci: the deploy/preview/destroy-preview jobs check out with the default `github.token` instead of a dedicated `COCOBOT_GITHUB_TOKEN` PAT. They only check out the repo at a known SHA (no cross-repo or private-dependency access), which the default token already permits — removing the last repo-level secret.
