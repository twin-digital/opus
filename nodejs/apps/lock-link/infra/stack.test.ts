import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, it } from 'vitest'

import { SERVICE_NAME } from '../src/service.js'
import { LockLinkStack } from './stack.js'

/**
 * Synth-time invariants. These aren't about "the code compiles" — they exist because
 * a rename or an env-var-cleanup PR is exactly the kind of change that would leave
 * alarms silently stranded at INSUFFICIENT_DATA, and only a template assertion catches it.
 */
describe('LockLinkStack', () => {
  const template = Template.fromStack(new LockLinkStack(new App(), 'Test'))

  it('creates all five CloudWatch alarms', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5)
  })

  it('pins POWERTOOLS_METRICS_NAMESPACE on the sync Lambda env — alarms depend on this exact value', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          POWERTOOLS_METRICS_NAMESPACE: 'lock-link',
        }),
      },
    })
  })

  it('each EMF alarm carries Namespace: lock-link + Dimensions: { service: SERVICE_NAME }', () => {
    // Renaming `SERVICE_NAME` re-targets every alarm on the next synth; this test catches
    // a partial-rename regression (constant renamed, one alarm still hard-codes the old
    // value) or a dropped `dimensionsMap`.
    for (const metricName of ['CodesWritten', 'Escalated', 'GapsFound']) {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Namespace: 'lock-link',
        MetricName: metricName,
        Dimensions: Match.arrayWith([Match.objectLike({ Name: 'service', Value: SERVICE_NAME })]),
      })
    }
  })

  it('InvocationsBelowMinimum treats missing data as BREACHING so a fully-stopped schedule fires', () => {
    // Lambda emits no `Invocations` datapoint at all when the function isn't invoked;
    // NOT_BREACHING here would silently score a stopped schedule as OK. See stack.ts.
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Invocations',
      Namespace: 'AWS/Lambda',
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 22,
      TreatMissingData: 'breaching',
    })
  })

  it('every EMF alarm uses NOT_BREACHING (the intentional default — steady state ≠ fault)', () => {
    for (const metricName of ['CodesWritten', 'Escalated', 'GapsFound']) {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        Namespace: 'lock-link',
        MetricName: metricName,
        TreatMissingData: 'notBreaching',
      })
    }
  })

  it('ZeroCodesWritten7d requires 7 consecutive daily breaches — not just one bad day', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'CodesWritten',
      EvaluationPeriods: 7,
      DatapointsToAlarm: 7,
      Threshold: 0,
    })
  })
})
