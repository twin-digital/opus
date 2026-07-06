import { loadConfig } from './config.js'
import { refresh } from './refresh.js'
import { start } from './supervisor.js'

/**
 * CLI dispatch. `start` (default) is the container entrypoint; `refresh` is the recurring
 * device-code login run via `docker exec`.
 */
const main = async (): Promise<void> => {
  const command = process.argv[2] ?? 'start'
  const cfg = loadConfig()
  switch (command) {
    case 'start':
      await start(cfg)
      break
    case 'refresh':
      await refresh(cfg)
      break
    default:
      process.stderr.write(`unknown command '${command}' (expected: start | refresh)\n`)
      process.exitCode = 2
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`credential-shelf: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
