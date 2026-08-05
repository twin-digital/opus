/** How long a burst of writes into an output tree must settle before a reconcile runs. */
export const DEBOUNCE_MS = 400

/** One watched pack: its built-output directory, and the identity a change is reported under. */
export interface WatchTarget {
  uuid: string
  outputDir: string
}

/** A running watch over built output. */
export interface OutputWatcher {
  stop(): Promise<void>
}

/**
 * Watches the built-output directories of the selected packs and reports a debounced change,
 * naming the packs whose output moved. The output tree is the only change report a build gives.
 */
export const watchBuiltOutput = (
  _targets: readonly WatchTarget[],
  _onChange: (changed: ReadonlySet<string>) => void,
): OutputWatcher => {
  throw new Error('not implemented: watchBuiltOutput')
}
