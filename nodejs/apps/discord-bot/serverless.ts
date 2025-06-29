import type { Serverless } from 'serverless/aws'
import { getDeploymentConfig } from '@twin-digital/deploy-tools'

const config = getDeploymentConfig()

export default {
  frameworkVersion: '~4.17.1',
  functions: {
    poc: {
      handler: 'src/functions/poc.handler',
    },
  },
  org: 'twindigital',
  provider: {
    name: 'aws',
    profile: config.profile,
    region: 'us-east-2',
    runtime: 'nodejs22.x',
    stage: config.stage,
  },
  service: 'discord-bot',
} satisfies Serverless
