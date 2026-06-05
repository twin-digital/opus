---
---

ci: make preview deploys opt-in via a `preview` label and supersede stale runs. `deploy-preview` now splits into a credential-free `gate` job (deploys only when the source PR is labeled `preview`) and the environment-gated `preview` deploy job, and sets `cancel-in-progress: true` so re-pushes don't stack pending approvals.
