import { App } from 'aws-cdk-lib'

import { LynxLodgifySyncStack } from './stack.js'

const app = new App()

// Environment-agnostic: account/region are resolved from the deploying credentials at deploy time.
new LynxLodgifySyncStack(app, 'LynxLodgifySync')
