---
'@twin-digital/lock-link': patch
---

Persist the Lynx JWT across Lambda cold starts in an SSM SecureString parameter. On the hourly schedule the container often goes cold between ticks — previously every cold start called `login`; now the first-ever run mints and writes back, and subsequent cold starts read the cached JWT and skip login (the JWT is valid ~95 days). CDK grants the Lambda `ssm:GetParameter` + `ssm:PutParameter` on the new `/lock-link/lynx-token` param plus `kms:GenerateDataKey` (via-service scoped to SSM) for SecureString writes. No out-of-band setup — the parameter is created on first `PutParameter` call.
