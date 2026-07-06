import { loadTriggerConfig } from './config.js'
import { startServer } from './server.js'

/**
 * Container entrypoint. Serves the LAN-facing trigger forever.
 *
 * With no `TRIGGER_TOKEN` the trigger stays **disabled and idle** rather than exiting — so a
 * consumer can define it as an always-on compose service (no profile gymnastics, which break
 * volume sharing under a different project name) and it simply does nothing until a token is
 * set. This is still fail-closed: with no token it never serves, so it can't be reached
 * unauthenticated.
 */
const main = async (): Promise<void> => {
  if ((process.env.TRIGGER_TOKEN ?? '') === '') {
    process.stdout.write('credential-shelf-trigger: TRIGGER_TOKEN not set — remote refresh disabled; idling.\n')
    // Idle without serving. A bare unsettled Promise does NOT keep Node's event loop alive (the
    // process would exit immediately → a restart loop under `restart: unless-stopped`), so hold a
    // ref'd timer and resolve on a termination signal so `docker stop` still exits promptly.
    await new Promise<void>((resolve) => {
      const keepAlive = setInterval(() => {
        /* ref'd no-op handle to keep the loop alive */
      }, 1 << 30)
      for (const sig of ['SIGTERM', 'SIGINT'] as const) {
        process.once(sig, () => {
          clearInterval(keepAlive)
          resolve()
        })
      }
    })
    return
  }
  const cfg = loadTriggerConfig()
  await startServer(cfg)
}

main().catch((err: unknown) => {
  process.stderr.write(`credential-shelf-trigger: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
