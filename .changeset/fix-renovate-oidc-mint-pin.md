---
---

ci: stop digest-pinning the self-referential Renovate changeset minter workflow.

`#152`'s digest-pin pass rewrote the reusable-workflow `uses: …@main` to a commit SHA, which changed the OIDC `job_workflow_ref` claim and broke the AWS minter role's StringEquals trust — so `mint-and-commit` could no longer assume the role and every Renovate PR failed the changeset gate. Restore the `@main` pin and exclude the `twin-digital/opus` self-reference from `helpers:pinGitHubActionDigests` so it stays unpinned.
