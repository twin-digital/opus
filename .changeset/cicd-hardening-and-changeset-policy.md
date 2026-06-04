---
---

Harden CI/CD workflows and document the actual deployment pipeline.

- Gate production deploys on CI success and deploy the exact CI-validated commit.
- SHA-pin all third-party GitHub Actions; add job timeouts and CI concurrency.
- Fix CI push trigger to cover slash-named branches and correct a stage-output casing bug.
- Replace the obsolete CDK design doc with an accurate `docs/CICD.md`.
- Require changesets for all project-code changes in `CLAUDE.md`.

No package code is affected, so this carries no version bump.
