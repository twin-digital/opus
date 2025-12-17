import { watch } from 'node:fs'

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
 * Creates a watcher which invokes a callback if there are changes to a static list of files.
 * @param files Set of files to monitor for changes.
 * @param onChange Callback to invoke if any file changes.
 * @param options Options to use when configuring the watcher.
 */
export const makeWatcher = (
  files: string[],
  onChange: () => void | Promise<void>,
  options: WatcherOptions = {},
): { start: () => void; stop: () => void } => {
  const { debounceMs = 250, onChangeStarted, onChangeCompleted, onError } = options

  const watchers = new Set<ReturnType<typeof watch>>()
  let callbackRunning = false
  let pendingCallback = false
  let timeoutId: NodeJS.Timeout | null = null

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
    for (const file of files) {
      const watcher = watch(file, (eventType) => {
        if (eventType === 'change') {
          handleChange(file)
        }
      })
      watchers.add(watcher)
    }
  }

  const stop = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    for (const watcher of watchers) {
      watcher.close()
    }

    watchers.clear()
  }

  return { start, stop }
}
