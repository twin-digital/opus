import { sep } from 'node:path'

import { watch } from 'chokidar'

/** How long a burst of writes into an output tree must settle before a reconcile runs. */
export const DEBOUNCE_MS = 400

/** One watched pack: its built-output directory, and the identity a change is reported under. */
export interface WatchTarget {
  uuid: string
  outputDir: string
}

/** A running watch over built output. */
export interface OutputWatcher {
  /** resolves once the initial scan is done and a change would be reported */
  ready: Promise<void>
  stop(): Promise<void>
}

/** The target whose output tree a changed path lies in. */
export const ownerOf = (targets: readonly WatchTarget[], path: string): WatchTarget | undefined =>
  targets.find((target) => path === target.outputDir || path.startsWith(`${target.outputDir}${sep}`))

/**
 * Watches the built-output directories of the selected packs and reports a debounced change,
 * naming the packs whose output moved. The output tree is the only change report a build gives.
 */
export const watchBuiltOutput = (
  targets: readonly WatchTarget[],
  onChange: (changed: ReadonlySet<string>) => void,
  debounceMs: number = DEBOUNCE_MS,
): OutputWatcher => {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined

  const watcher = watch(
    targets.map((target) => target.outputDir),
    { ignoreInitial: true },
  )

  watcher.on('all', (_event, path) => {
    const owner = ownerOf(targets, path)
    if (owner === undefined) {
      return
    }
    pending.add(owner.uuid)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const changed = new Set(pending)
      pending.clear()
      onChange(changed)
    }, debounceMs)
  })

  return {
    ready: new Promise<void>((resolve) => {
      watcher.on('ready', () => {
        resolve()
      })
    }),
    stop: async () => {
      clearTimeout(timer)
      await watcher.close()
    },
  }
}
