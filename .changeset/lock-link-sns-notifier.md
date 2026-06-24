---
'@twin-digital/lock-link': patch
---

Back the escalation `Notifier` with SNS: `createSnsNotifier` publishes each event to a topic (severity as the subject prefix and a message attribute for filtering/routing). CDK provisions the topic, subscribes an alert email, grants the Lambda `sns:Publish`, and passes the topic ARN via `LOCK_LINK_ALERT_TOPIC_ARN` — decoupling the handler from topic ownership so it can later point at a shared cross-workload topic with no code change. Config validates the ARN.
