---
---

ci: deploy-preview adds a sticky `preview-deployed` label when it deploys a stage, and destroy-preview only tears down on close when that label is present — so PR closes that never deployed no longer enter the `preview` environment or run a no-op `serverless remove`, and the teardown decision is keyed on the PR number (immune to branch reuse/rename)
