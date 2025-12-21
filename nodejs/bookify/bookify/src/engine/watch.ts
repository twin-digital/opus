import chokidar, { type FSWatcher } from 'chokidar'

interface WatcherOptions {
  /**
   * Debounce delay, in ms, to wait for file changes to settle.
   * @defaultValue 250
   */
  debounceMs?: number

  /**
   * Optional callback invoked when a change is detected in a file.
   * @param filename Name of the changed file
   */
  onChangeStarted?: (filename: string) => void

  /**
   * Optional callback invoked when change process is completed.
   */
  onChangeCompleted?: () => void

  /**
   * Optional callback invoked if there is an error handling a change.
   */
  onError?: (error: unknown) => void
}

/**
 * Creates a watcher which invokes a callback if there are changes to files matching the patterns.
 * Supports glob patterns in addition to individual file paths.
 * Supports dynamically updating the watch list.
 *
 * @param patterns Set of files or glob patterns to monitor for changes.
 * @param onChange Callback to invoke if any file changes.
 * @param options Options to use when configuring the watcher.
 */
export const makeWatcher = (
  patterns: string[],
  onChange: () => void | Promise<void>,
  options: WatcherOptions = {},
): { start: () => void; stop: () => Promise<void>; updateWatchList: (newPatterns: string[]) => void } => {
  const { debounceMs = 250, onChangeStarted, onChangeCompleted, onError } = options

  let watcher: FSWatcher | null = null
  let callbackRunning = false
  let pendingCallback = false
  let timeoutId: NodeJS.Timeout | null = null
  let currentWatchedPatterns = new Set<string>()

  const invokeCallback = async () => {
    if (callbackRunning) {
      pendingCallback = true
      return
    }

    callbackRunning = true

    try {
      await onChange()
      onChangeCompleted?.()
    } catch (error) {
      onError?.(error)
    } finally {
      callbackRunning = false

      // Check if more changes came in while we were running the callback
      if (pendingCallback) {
        pendingCallback = false
        // Recursively call to handle the pending changes
        await invokeCallback()
      }
    }
  }

  const handleChange = (filename: string) => {
    // Clear any existing debounce timer
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // Debounce: wait for quiet period before regenerating
    timeoutId = setTimeout(() => {
      onChangeStarted?.(filename)
      void invokeCallback()
    }, debounceMs)
  }

  const start = () => {
    // Use chokidar which natively supports glob patterns
    watcher = chokidar.watch(patterns, {
      ignoreInitial: true,
      persistent: true,
    })

    // Track currently watched patterns
    currentWatchedPatterns = new Set(patterns)

    watcher.on('change', handleChange)
    watcher.on('add', handleChange)
    watcher.on('unlink', handleChange)
  }

  const updateWatchList = (newPatterns: string[]) => {
    if (!watcher) {
      return
    }

    const newPatternSet = new Set(newPatterns)

    // Find patterns to add (in new but not in current)
    const toAdd = newPatterns.filter((p) => !currentWatchedPatterns.has(p))

    // Find patterns to remove (in current but not in new)
    const toRemove = Array.from(currentWatchedPatterns).filter((p) => !newPatternSet.has(p))

    // Add new patterns
    if (toAdd.length > 0) {
      watcher.add(toAdd)
    }

    // Remove old patterns
    if (toRemove.length > 0) {
      watcher.unwatch(toRemove)
    }

    // Update tracked patterns
    currentWatchedPatterns = newPatternSet
  }

  const stop = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // Wait for any running callback to complete
    while (callbackRunning) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    if (watcher) {
      await watcher.close()
      watcher = null
    }

    currentWatchedPatterns.clear()
  }

  return { start, stop, updateWatchList }
}
