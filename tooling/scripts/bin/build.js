#!/usr/bin/env node

import { makeBuilder } from '../lib/build-helpers/build.js'

const buildStrategy = await makeBuilder()
await buildStrategy.build()
