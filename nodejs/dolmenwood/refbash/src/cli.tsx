#!/usr/bin/env node

import { config } from 'dotenv'
import React from 'react'
import { withFullScreen } from 'fullscreen-ink'
import meow from 'meow'
import chalk from 'chalk'
import App from './app.js'
import { patchConsoleToLog } from './utils/log-utils.js'

// force truecolor support
chalk.level = 3

// Load environment variables from .env file
config({ quiet: true })

const cli = meow(
  `
	Usage
	  $ refbash

	Options
		--name  Your name

	Examples
	  $ refbash --name=Jane
	  Hello, Jane
`,
  {
    importMeta: import.meta,
    flags: {
      name: {
        type: 'string',
      },
    },
  },
)

patchConsoleToLog('refbash.log')

console.log('-------------------------------------------')
console.log(`Starting refbash @ ${new Date().toISOString()}`)
console.log('-------------------------------------------')

await withFullScreen(<App name={cli.flags.name} />, {
  patchConsole: false,
}).start()
