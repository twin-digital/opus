#!/usr/bin/env node
import React from 'react'
import { withFullScreen } from 'fullscreen-ink'
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

await withFullScreen(<App name={cli.flags.name} />, {}).start()
