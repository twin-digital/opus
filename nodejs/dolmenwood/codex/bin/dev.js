#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import { config } from 'dotenv'
import { execute } from '@oclif/core'

// Load environment variables from .env file
config({ quiet: true })

await execute({ development: true, dir: import.meta.url })
