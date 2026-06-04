---
'@twin-digital/repo-kit': patch
'@twin-digital/bookify': patch
'@twin-digital/bookify-cli': patch
'@twin-digital/bookify-render-api': patch
'@twin-digital/refbash': patch
'@twin-digital/serverless-dev-tools': patch
'@twin-digital/observability-lib': patch
'@twin-digital/context-server': patch
'@twin-digital/discord-bot': patch
'@twin-digital/codex': patch
'@twin-digital/dolmenwood-bot': patch
'@twin-digital/opus-scripts': patch
'@twin-digital/bedrock': patch
---

Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
