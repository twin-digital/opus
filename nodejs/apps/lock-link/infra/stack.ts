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

    const syncFunction = new NodejsFunction(this, 'SyncFunction', {
      entry: syncEntry,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
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
