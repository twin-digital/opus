import { fileURLToPath } from 'node:url'

import { Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import type { Construct } from 'constructs'

const syncEntry = fileURLToPath(new URL('./functions/sync.ts', import.meta.url))

export class LynxLodgifySyncStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const syncFunction = new NodejsFunction(this, 'SyncFunction', {
      entry: syncEntry,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
    })

    // Placeholder cadence — tighten once the real sync logic lands.
    new Rule(this, 'Schedule', {
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(syncFunction)],
    })
  }
}
