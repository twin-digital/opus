'use strict'

const { getDeploymentConfig } = require('@twin-digital/deploy-tools')

const config = getDeploymentConfig()

module.exports = {
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
}
