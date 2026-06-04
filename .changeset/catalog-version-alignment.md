---
'@twin-digital/repo-kit': patch
'@twin-digital/bookify': patch
'@twin-digital/bookify-cli': patch
'@twin-digital/refbash': patch
'@twin-digital/serverless-dev-tools': patch
'@twin-digital/observability-lib': patch
---

Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `@aws-sdk/client-s3`, `tsdown`, `execa`, and `yaml` are now defined once in the workspace catalog (each pinned to the latest version already in use across the repo), and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
