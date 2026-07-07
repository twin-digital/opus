/**
 * The service name used for both observability (as the `service` dimension on EMF
 * metrics and the logger's `service` field) and CloudWatch alarm targeting (as
 * `dimensionsMap: { service: SERVICE_NAME }` in the CDK stack).
 *
 * Shared between runtime and infra so a rename can't silently strand the alarms —
 * the handler's `withObservability({ serviceName: SERVICE_NAME })` and
 * `stack.ts`'s alarm lookup both read from here. If you want to rename the
 * service, change it here; the alarms will re-target on the next synth and the
 * runtime will emit the new dimension automatically.
 */
export const SERVICE_NAME = 'lock-link'
