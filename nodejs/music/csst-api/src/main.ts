import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const port = Number(process.env.CSST_API_PORT ?? 8766)

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`CS Studio API listening on http://localhost:${String(info.port)}`)
})
