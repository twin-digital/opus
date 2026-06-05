---
---

ci: split Renovate updates for install/build-script packages (pnpm onlyBuiltDependencies) into their own labeled PRs and exclude them from auto-merge; block dependency install scripts (`NPM_CONFIG_IGNORE_SCRIPTS`) in the ungated CI workflows (ci, merge-checks) so they don't execute on dependency PRs (the privileged renovate-changeset install already uses `--ignore-scripts`)
