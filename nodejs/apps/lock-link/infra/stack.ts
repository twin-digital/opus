import { fileURLToPath } from 'node:url'

import { Arn, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { Alarm, type AlarmProps, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Alias } from 'aws-cdk-lib/aws-kms'
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Topic } from 'aws-cdk-lib/aws-sns'
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions'
import type { Construct } from 'constructs'

import { SERVICE_NAME } from '../src/service.js'

/** CloudWatch namespace for the sync's application metrics. Powertools writes here when
 * `POWERTOOLS_METRICS_NAMESPACE` is set (see env below). Kept as a local because the
 * namespace is an infra-side choice — the runtime doesn't reason about it — while
 * `SERVICE_NAME` is shared with the handler so a rename can't strand the alarms. */
const METRICS_NAMESPACE = 'lock-link'

/**
 * SSM SecureString parameter names. Values are populated **out-of-band** (initial setup;
 * AWS Console or `aws ssm put-parameter --type SecureString`) and rotatable without
 * redeploy — CFN never sees the secret material. CDK only grants read access by name and
 * tells the handler where to look (env).
 */
const SECRET_PARAMS = {
  lynxUsername: '/lock-link/lynx-username',
  lynxPassword: '/lock-link/lynx-password',
  lodgifyApiKey: '/lock-link/lodgify-api-key',
}

/**
 * SSM SecureString parameter for the durable Lynx JWT cache. Distinct from `SECRET_PARAMS`
 * because the Lambda writes it itself: on first-ever run it doesn't exist (the client
 * mints a fresh JWT and `PutParameter` creates it); thereafter cold starts read it and
 * skip `login`. Needs `ssm:GetParameter` + `ssm:PutParameter`, and `kms:GenerateDataKey`
 * on the AWS-managed SSM key (the "via-service" grant below covers this).
 */
const TOKEN_PARAM = '/lock-link/lynx-token'

// Runtime handler lives in src/ (infra → src dependency); never the reverse.
const syncEntry = fileURLToPath(new URL('../src/functions/sync.ts', import.meta.url))

export class LockLinkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // Escalation channel. Created here for now; it will become a shared cross-workload
    // topic later — the Lambda only consumes the ARN (env), so swapping to an imported
    // topic won't touch the handler. Email subscription is confirm-on-first-deploy.
    // Server-side encryption: escalation messages carry `confirmationCode` (embeds the
    // Lynx accountId) and `bookingId` — indirectly identifying guests — so the topic is
    // encrypted with the AWS-managed SNS key (matches SSM SecureString care).
    const alertTopic = new Topic(this, 'AlertTopic', {
      displayName: 'lock-link alerts',
      masterKey: Alias.fromAliasName(this, 'SnsKey', 'alias/aws/sns'),
    })
    alertTopic.addSubscription(new EmailSubscription('skleinjung@gmail.com'))

    // NOTE: once there's a second CDK app, extract a shared base construct that pre-fills these
    // bundling defaults (runtime, source condition, lockfile) so they can't drift between apps.
    // Not worth the indirection for a single app yet.
    const syncFunction = new NodejsFunction(this, 'SyncFunction', {
      entry: syncEntry,
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      // Powertools Tracer emits ColdStart / subsegment annotations; ACTIVE tracing lets
      // those land in X-Ray (and stops the "cannot annotate the main segment" warning).
      tracing: Tracing.ACTIVE,
      // Operational config the handler reads + validates via loadConfig() (src/config.ts).
      // Tunable without a code change. Secrets (Lynx creds, Lodgify key) are NOT here —
      // they're read from SSM SecureString at runtime so they stay encrypted/rotatable.
      environment: {
        LOCK_LINK_ACCOUNT_ID: '222262', // Lynx umbrella account id
        LOCK_LINK_USER_ID: '232753', // Lynx per-user (automation) id
        LOCK_LINK_HORIZON_DAYS: '14', // fill gaps arriving within 2 weeks
        LOCK_LINK_SLA_HOURS: '48', // escalate if still bare within 48h of arrival
        LOCK_LINK_GRACE_MINUTES: '30', // ...but not for bookings under 30m old
        LOCK_LINK_ALERT_TOPIC_ARN: alertTopic.topicArn,
        LOCK_LINK_LYNX_USERNAME_PARAM: SECRET_PARAMS.lynxUsername,
        LOCK_LINK_LYNX_PASSWORD_PARAM: SECRET_PARAMS.lynxPassword,
        LOCK_LINK_LODGIFY_API_KEY_PARAM: SECRET_PARAMS.lodgifyApiKey,
        LOCK_LINK_LYNX_TOKEN_PARAM: TOKEN_PARAM,
        // Pin the Powertools metrics namespace so it doesn't fall back to the default
        // `Application`; the alarms below reference this exact namespace. The `service`
        // dimension comes from the handler's `withObservability({ serviceName })`
        // option, which reads from the shared `SERVICE_NAME` constant — no env var
        // needed and no drift risk from a handler rename.
        POWERTOOLS_METRICS_NAMESPACE: METRICS_NAMESPACE,
      },
      bundling: {
        // Resolve workspace deps (observability-lib, logger-lib) via their `source` export
        // condition, matching the monorepo's source-first model so synth needs no prebuilt dist.
        esbuildArgs: { '--conditions': 'source' },
      },
    })
    alertTopic.grantPublish(syncFunction)

    // SSM parameter grants. Least-privilege: read-only on the three creds (values live in
    // SSM, populated out-of-band); read+write on the token cache param (Lambda-managed).
    // The parameter resources themselves are not in this stack — the token param is
    // created on first `PutParameter` call, and the creds are populated out-of-band.
    const paramArn = (name: string) =>
      Arn.format({ service: 'ssm', resource: 'parameter', resourceName: name.replace(/^\//, '') }, this)
    const secretParamArns = Object.values(SECRET_PARAMS).map(paramArn)
    const tokenParamArn = paramArn(TOKEN_PARAM)
    syncFunction.addToRolePolicy(
      new PolicyStatement({ actions: ['ssm:GetParameter'], resources: [...secretParamArns, tokenParamArn] }),
    )
    syncFunction.addToRolePolicy(new PolicyStatement({ actions: ['ssm:PutParameter'], resources: [tokenParamArn] }))
    // KMS authorization runs against the underlying CMK ARN, not the alias — and the
    // AWS-managed CMK ARN isn't predictable at synth time. Scope by service instead:
    // `kms:ViaService` restricts each grant to calls originating from that service in
    // this region, so `resources: ['*']` is still least-privilege.
    const viaService = (service: string, actions: string[], extraConditions: Record<string, unknown> = {}) =>
      new PolicyStatement({
        actions,
        resources: ['*'],
        conditions: {
          StringEquals: { 'kms:ViaService': `${service}.${this.region}.amazonaws.com`, ...extraConditions },
        },
      })
    // Read (all four params) — decrypt via SSM only.
    syncFunction.addToRolePolicy(viaService('ssm', ['kms:Decrypt']))
    // Write (token param only) — SecureString write needs Encrypt + GenerateDataKey.
    // Additionally scope by `kms:EncryptionContext:PARAMETER_ARN`: SSM passes the
    // target parameter's ARN as encryption context, so this grant can only encrypt
    // material bound for the token cache — not the three credential params.
    syncFunction.addToRolePolicy(
      viaService('ssm', ['kms:Encrypt', 'kms:GenerateDataKey'], {
        'kms:EncryptionContext:PARAMETER_ARN': tokenParamArn,
      }),
    )
    syncFunction.addToRolePolicy(viaService('sns', ['kms:GenerateDataKey', 'kms:Decrypt']))

    new Rule(this, 'Schedule', {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(syncFunction)],
    })

    // CloudWatch alarms — every alarm publishes to the same `alertTopic` the escalation
    // notifier uses, so operator routing (email) is already in place. `NOT_BREACHING` on
    // missing data: a missing datapoint means "the sync didn't emit that metric" (usually
    // steady state), NOT "something is wrong" — treating it as breaching would give false
    // pages every hour there was no interesting activity.
    const snsAction = new SnsAction(alertTopic)
    const appMetric = (metricName: string, period: Duration) =>
      new Metric({
        namespace: METRICS_NAMESPACE,
        metricName,
        dimensionsMap: { service: SERVICE_NAME },
        statistic: 'Sum',
        period,
      })
    const alarm = (id: string, config: Omit<AlarmProps, 'evaluationPeriods'>) => {
      const a = new Alarm(this, id, {
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        ...config,
      })
      a.addAlarmAction(snsAction)
      return a
    }

    // Health — the schedule stopped firing or the handler is throwing.
    // `BREACHING` on missing data (overriding the helper's default `NOT_BREACHING`):
    // Lambda emits no `Invocations` datapoint at all when the function isn't invoked,
    // so `NOT_BREACHING` would score a fully-stopped schedule as OK and silently miss
    // the exact failure this alarm exists to catch. Expect one alarm shortly after
    // the initial deploy (the trailing 24h has no data until the first tick fires).
    alarm('InvocationsBelowMinimum', {
      metric: syncFunction.metricInvocations({ period: Duration.hours(24), statistic: 'Sum' }),
      threshold: 22, // 24 expected/day; 22 leaves slack for one skipped tick + one late deploy.
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      alarmDescription: 'lock-link sync fired fewer than 22 times in 24h — schedule may have stopped',
    })
    alarm('FunctionErrors', {
      metric: syncFunction.metricErrors({ period: Duration.hours(1), statistic: 'Sum' }),
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'lock-link sync threw an exception in the last hour',
    })

    // Behavior — sync is running but not accomplishing anything useful.
    // 7 daily sums must ALL be ≤ 0 before alarming. Zero writes on a single day is
    // legitimate (slow booking week, all bookings already have codes); a full week
    // without a single write suggests a silently-broken pipeline.
    //
    // Coverage matrix (deliberate): this alarm fires when the handler is completing
    // normally but writing nothing — Powertools emits `CodesWritten: 0` on every
    // healthy invocation, giving CloudWatch a datapoint of 0 to score. The other
    // failure modes are covered separately: a handler that throws before emitting
    // metrics is caught by `FunctionErrors` (within 1h); a schedule that stops
    // firing is caught by `InvocationsBelowMinimum` (within 24h). `NOT_BREACHING`
    // on missing data is intentional — flipping to BREACHING would fire during the
    // first-week deploy window when historical periods are missing by construction.
    new Alarm(this, 'ZeroCodesWritten7d', {
      metric: appMetric('CodesWritten', Duration.hours(24)),
      threshold: 0,
      comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 7,
      datapointsToAlarm: 7,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'lock-link wrote zero codes for 7 consecutive days — pipeline may be silently unhealthy',
    }).addAlarmAction(snsAction)
    alarm('EscalationsInLastHour', {
      metric: appMetric('Escalated', Duration.hours(1)),
      threshold: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'lock-link escalated at least one gap — a code was not ready before SLA',
    })

    // Nice-to-have — a spike suggests an upstream data problem (e.g., Lodgify bulk-cleared
    // codes, or Lynx dropped reservations). 25 is a starting threshold; retune once real
    // steady-state cadence is characterized.
    alarm('GapsFoundSpike', {
      metric: appMetric('GapsFound', Duration.hours(1)),
      threshold: 25,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'lock-link surfaced >25 gaps in one hour — likely upstream data anomaly',
    })
  }
}
