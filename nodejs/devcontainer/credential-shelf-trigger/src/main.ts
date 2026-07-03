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
    await new Promise(() => {
      /* idle forever; nothing to serve */
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
