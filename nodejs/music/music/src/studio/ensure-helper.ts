import { logger } from '../logger.js'
import { bundledHelperHash, defaultResourcePath, installHelper } from './helper.js'
import type { StudioService } from './studio-service.js'

const log = logger.child({}, { msgPrefix: '[HELPER] ' })

/** How long to wait for a reloaded watcher to publish the expected hash. */
const RELOAD_TIMEOUT_MS = 5000

export type HelperOutcome =
  | { ok: true; changed: string[] }
  | { ok: false; reason: 'not-running' | 'mismatch' | 'unreachable'; detail: string; changed: string[] }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Brings REAPER's watcher in line with this app: installs the bundled files, asks a running
 * watcher to reload if it differs, and reports whether the watcher REAPER now runs is the one
 * this app ships. The caller decides whether a bad outcome is fatal.
 */
export const ensureHelper = async ({
  service,
  resourcePath = defaultResourcePath(),
}: {
  service: StudioService
  resourcePath?: string
}): Promise<HelperOutcome> => {
  const expected = await bundledHelperHash()
  const { changed } = await installHelper(resourcePath)

  await service.refresh()
  const { connected } = service.getState()
  let { helper } = service.getState()
  if (!connected) {
    return { ok: false, reason: 'unreachable', detail: 'REAPER is not answering on its web interface.', changed }
  }
  if (helper === undefined) {
    return {
      ok: false,
      reason: 'not-running',
      detail:
        'No studio watcher is running in REAPER. Restart REAPER so its startup script loads the one just installed.',
      changed,
    }
  }
  if (helper.matches) {
    return { ok: true, changed }
  }

  log.info(
    `Watcher ${helper.version} (${helper.hash}) differs from the bundled one (${expected}); asking it to reload.`,
  )
  await service.reloadHelper()
  const deadline = Date.now() + RELOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    await wait(250)
    await service.refresh()
    helper = service.getState().helper
    if (helper?.matches === true) {
      return { ok: true, changed }
    }
  }
  return {
    ok: false,
    reason: 'mismatch',
    detail: `REAPER runs watcher ${helper?.version ?? '?'} (${helper?.hash ?? '?'}), expected ${expected}. It did not reload; restart REAPER.`,
    changed,
  }
}
