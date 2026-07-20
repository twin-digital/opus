---
'@thrashplay/farwatch': patch
'@thrashplay/fw-chronicler': patch
'@thrashplay/fw-core': patch
'@thrashplay/fw-simulation': patch
'@thrashplay/fw-worldgen': patch
'@thrashplay/launchpad-sim': patch
'@thrashplay/music': patch
'@twin-digital/bedrock': patch
'@twin-digital/bookify': patch
'@twin-digital/bookify-cli': patch
'@twin-digital/bookify-render-api': patch
'@twin-digital/cli-lib': patch
'@twin-digital/codex': patch
'@twin-digital/context-server': patch
'@twin-digital/credential-shelf': patch
'@twin-digital/credential-shelf-trigger': patch
'@twin-digital/discord-bot': patch
'@twin-digital/dolmenwood': patch
'@twin-digital/dolmenwood-bot': patch
'@twin-digital/genai-core': patch
'@twin-digital/json-patch-x': patch
'@twin-digital/lambda-test-lib': patch
'@twin-digital/lock-link': patch
'@twin-digital/logger-lib': patch
'@twin-digital/observability-lib': patch
'@twin-digital/refbash': patch
'@twin-digital/renovate-tools': patch
'@twin-digital/repo-kit': patch
'@twin-digital/serverless-dev-tools': patch
'@twin-digital/tsdown-config': patch
'@twin-digital/vitest-config': patch
---

Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
