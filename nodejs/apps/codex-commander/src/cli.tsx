#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import meow from 'meow'
import App from './app.js'

const cli = meow(
  `
	Usage
	  $ codex-commander

	Options
		--name  Your name

	Examples
	  $ codex-commander --name=Jane
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

const app = render(<App name={cli.flags.name} />)
await app.waitUntilExit()
