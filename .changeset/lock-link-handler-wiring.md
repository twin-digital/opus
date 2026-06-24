---
'@twin-digital/lock-link': patch
---

Wire the Lambda handler to `runSync`: load + validate env config, read the Lynx username/password and Lodgify API key from SSM SecureString (Powertools `parameters`, decrypt + cache across warm invocations), build the clients + SNS notifier, and run the gap-fill loop. Parameter _names_ live in env (configurable); values stay encrypted in SSM and never enter CFN. CDK grants the Lambda least-privilege `ssm:GetParameter` on the three named parameters + `kms:Decrypt` on the AWS-managed SSM key. Parameter values are populated out-of-band on initial setup.
