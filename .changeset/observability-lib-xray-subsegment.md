---
'@twin-digital/observability-lib': patch
---

`observabilityMiddleware` now opens a Powertools X-Ray subsegment (via `captureLambdaHandler`) around each invocation before annotating, and closes it after metrics flush.

Previously, `tracer.putAnnotation('correlationId', …)` ran against the Lambda-provided facade segment, which Powertools refuses to annotate — producing a "cannot annotate the main segment in a Lambda execution environment" WARN on every invocation. The middleware now composes Powertools' `captureLambdaHandler` first, so annotations land on the subsegment and the warning stops. As a bonus, the handler's execution is now a named subsegment in the X-Ray trace tree.

No API changes; consumers using `withObservability` / `observabilityMiddleware` see the warning disappear on next deploy.
