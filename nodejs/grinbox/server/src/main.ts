/**
 * Process entrypoint — the "run the daemon" side effect.
 *
 * Importing `@twin-digital/grinbox-server` (the library barrel) must NOT start a server, so
 * the side effect lives here and runs only when this module is executed
 * directly (`node dist/main.js` / `tsx src/main.ts`). Tests import `startDaemon`
 * / `createApp` from the library surface and never trip this.
 */
import { type Daemon, startDaemon } from './daemon.js'

async function main(): Promise<void> {
  let daemon: Daemon
  try {
    daemon = await startDaemon()
  } catch (err) {
    // Startup failure (bad config, missing key, migration error): log and exit
    // non-zero. systemd's RestartSec delays the restart (crash-loop prevention).
    console.error('[grinbox] startup failed:', err)
    process.exit(1)
  }

  let shuttingDown = false
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.log(`[grinbox] received ${signal}, shutting down…`)
    daemon
      .shutdown()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error('[grinbox] error during shutdown:', err)
        process.exit(1)
      })
  }

  process.on('SIGTERM', () => {
    handleSignal('SIGTERM')
  })
  process.on('SIGINT', () => {
    handleSignal('SIGINT')
  })
}

main().catch((err: unknown) => {
  console.error('[grinbox] fatal:', err)
  process.exit(1)
})
