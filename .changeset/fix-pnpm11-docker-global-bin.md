---
'@twin-digital/credential-shelf': patch
'@twin-digital/credential-shelf-trigger': patch
'@twin-digital/codex': patch
---

Fix Docker image builds broken by pnpm 11: global bins now install into `$PNPM_HOME/bin` (pnpm
10 used `$PNPM_HOME` directly), so `pnpm add -g turbo` failed with "global bin directory is not
in PATH" and every image build in the publish pipeline aborted. The images' PATH now includes
both locations, and the redundant silenced `pnpm setup` call is gone.
