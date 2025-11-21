#!/usr/bin/env node

import { config } from 'dotenv'
import { execute } from '@oclif/core'

// Load environment variables from .env file
config({ quiet: true })

await execute({ dir: import.meta.url })
