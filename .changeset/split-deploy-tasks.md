---
'@twin-digital/discord-bot': patch
'@twin-digital/bookify-render-api': patch
'@twin-digital/lock-link': patch
---

Split the deploy/destroy scripts into tool-typed turbo tasks (`deploy:serverless` / `deploy:cdk`) so CI can deploy each tool to its own account and role. Membership is implicit — `turbo run deploy:serverless` runs only packages defining it, `deploy:cdk` only CDK apps. No change to what is deployed.
