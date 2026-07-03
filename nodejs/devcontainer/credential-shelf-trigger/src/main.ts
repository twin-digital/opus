import { loadTriggerConfig } from './config.js'
import { startServer } from './server.js'

/**
 * Container entrypoint. Loads config from the environment (fails closed without an auth
 * token) and serves the LAN-facing trigger forever.
 */
const main = async (): Promise<void> => {
  const cfg = loadTriggerConfig()
  await startServer(cfg)
}

main().catch((err: unknown) => {
  process.stderr.write(`credential-shelf-trigger: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
