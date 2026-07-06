import { loadTriggerConfig } from './config.js'
import { startServer } from './server.js'

/**
 * Idle forever WITHOUT serving. A bare unsettled Promise does NOT keep Node's event loop alive (the
 * process would exit immediately → a restart loop under `restart: unless-stopped`), so hold a ref'd
 * timer, and resolve on a termination signal so `docker stop` still exits promptly. Extracted so the
 * keep-alive + signal contract is unit-testable (inject the signal list) without spawning a process.
 */
export const idleUntilSignal = (signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']): Promise<void> =>
  new Promise((resolve) => {
    const keepAlive = setInterval(() => {
      /* ref'd no-op handle to keep the loop alive */
    }, 1 << 30)
    for (const sig of signals) {
      process.once(sig, () => {
        clearInterval(keepAlive)
        resolve()
      })
    }
  })

/**
 * Container entrypoint. Serves the LAN-facing trigger forever. With no `TRIGGER_TOKEN` it stays
 * disabled and idle (never serves — fail-closed) so it can run as an always-on compose service and
 * be enabled later by setting the token.
 */
export const main = async (): Promise<void> => {
  if ((process.env.TRIGGER_TOKEN ?? '') === '') {
    process.stdout.write('credential-shelf-trigger: TRIGGER_TOKEN not set — remote refresh disabled; idling.\n')
    await idleUntilSignal()
    return
  }
  const cfg = loadTriggerConfig()
  await startServer(cfg)
}

/** Entrypoint wrapper (invoked by bin/run.js) — runs `main` and maps a fatal error to exit 1. */
export const run = (): void => {
  main().catch((err: unknown) => {
    process.stderr.write(`credential-shelf-trigger: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}
