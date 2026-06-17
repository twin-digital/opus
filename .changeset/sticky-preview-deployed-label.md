---
---

ci: deploy-preview adds a sticky `preview-deployed` label when it deploys a stage, and destroy-preview only tears down on close when that label is present — so PR closes that never deployed no longer enter the `preview` environment or run a no-op `serverless remove`, and the teardown decision is keyed on the PR number (immune to branch reuse/rename). destroy-preview also moves to `pull_request_target` so fork-PR previews can be torn down (the `pull_request` trigger gave fork runs no AWS creds → leaked stacks), and deploy-preview skips deploying if the PR is already closed (avoids orphaned stages)
