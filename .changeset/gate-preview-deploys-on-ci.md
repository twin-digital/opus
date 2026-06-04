---
---

Gate preview deploys on CI, mirroring production.

Move preview deploys out of `deploy.yaml` into a dedicated `deploy-preview.yaml`
triggered by `workflow_run` on CI completion, so a PR only deploys a preview after
its CI run passes for that exact commit (previously previews ran in parallel with CI).
`deploy.yaml` is now production-only.

CI/CD-only change; no package version bump.
