---
"@twin-digital/bookify-render-api": patch
---

Fix deployment error caused by incorrect alarm configuration syntax. Changed 'function:' to 'functionName:' for all function-level alarms in serverless.yml to match the expected parameter name for serverless-plugin-aws-alerts.
