import { fileURLToPath } from 'node:url'

import { Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import type { Construct } from 'constructs'

// Runtime handler lives in src/ (infra → src dependency); never the reverse.
const syncEntry = fileURLToPath(new URL('../src/functions/sync.ts', import.meta.url))

export class LockLinkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

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
      },
      bundling: {
        // Resolve workspace deps (observability-lib, logger-lib) via their `source` export
        // condition, matching the monorepo's source-first model so synth needs no prebuilt dist.
        esbuildArgs: { '--conditions': 'source' },
      },
    })

    // Placeholder cadence — tighten once the real sync logic lands.
    new Rule(this, 'Schedule', {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(syncFunction)],
    })
  }
}
