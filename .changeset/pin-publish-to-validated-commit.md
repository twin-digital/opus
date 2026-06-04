---
---

Pin the publish/Docker release jobs to the CI-validated commit.

`publish.yaml`'s release jobs now check out `github.event.workflow_run.head_sha`,
so the published npm version, its git tags, and the built/pushed Docker images all
correspond to the exact commit CI validated — a newer `main` commit can no longer be
built and tagged under the just-published version.

CI/CD-only change; no package version bump.
