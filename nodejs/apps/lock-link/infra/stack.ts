import { fileURLToPath } from 'node:url'

import { Arn, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Alias } from 'aws-cdk-lib/aws-kms'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Topic } from 'aws-cdk-lib/aws-sns'
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions'
import type { Construct } from 'constructs'

/**
 * SSM SecureString parameter names. The values are populated **out-of-band** (initial
 * setup; AWS Console or `aws ssm put-parameter --type SecureString`) and rotatable
 * without redeploy — CFN never sees the secret material. CDK only grants read access by
 * name and tells the handler where to look (env).
 */
const SECRET_PARAMS = {
  lynxUsername: '/lock-link/lynx-username',
  lynxPassword: '/lock-link/lynx-password',
  lodgifyApiKey: '/lock-link/lodgify-api-key',
}

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
      },
      bundling: {
        // Resolve workspace deps (observability-lib, logger-lib) via their `source` export
        // condition, matching the monorepo's source-first model so synth needs no prebuilt dist.
        esbuildArgs: { '--conditions': 'source' },
      },
    })
    alertTopic.grantPublish(syncFunction)

    // Least-privilege read on the three secret parameters + decrypt with the AWS-managed
    // SSM key (the default for SecureString). The parameter resources themselves are not
    // in this stack — values are managed out-of-band so secret material never enters CFN.
    const parameterArns = Object.values(SECRET_PARAMS).map((name) =>
      Arn.format({ service: 'ssm', resource: 'parameter', resourceName: name.replace(/^\//, '') }, this),
    )
    syncFunction.addToRolePolicy(new PolicyStatement({ actions: ['ssm:GetParameter'], resources: parameterArns }))
    // KMS authorization runs against the underlying CMK ARN, not the alias — the
    // AWS-managed `alias/aws/ssm` key ARN isn't predictable at synth time, so we scope by
    // service instead. The `kms:ViaService` condition restricts the grant to KMS calls
    // originating from SSM in this region, so this is still least-privilege.
    syncFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    )
    // Same pattern for the SNS topic's SSE key: encrypted-topic publishes need
    // `kms:GenerateDataKey` on the topic's CMK, scoped by ViaService to SNS.
    syncFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `sns.${this.region}.amazonaws.com` } },
      }),
    )

    // Placeholder cadence — tighten once the real sync logic lands.
    new Rule(this, 'Schedule', {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(syncFunction)],
    })
  }
}
