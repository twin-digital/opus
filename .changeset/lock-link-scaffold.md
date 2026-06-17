---
'@twin-digital/lock-link': minor
---

Add the `lock-link` app: a scheduled Lambda scaffold (logs on each run via observability-lib) and its self-contained AWS CDK stack (NodejsFunction + hourly EventBridge schedule), split into `infra/` and `src/` source roots.
