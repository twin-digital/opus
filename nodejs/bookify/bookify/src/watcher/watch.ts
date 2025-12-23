import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import type { Logger } from '../log.js'

export interface WatcherOptions {
  /** Debounce delay in milliseconds to wait for file changes to settle (default: 250) */
  debounceMs?: number
  /** Callback invoked when a change is detected */
  onChangeStarted?: (filename: string) => void
  /** Callback invoked when change processing completes */
  onChangeCompleted?: () => void
  /** Callback invoked if an error occurs during change handling */
  onError?: (error: unknown) => void
  /** Logger for watch operations */
  logger?: Logger
}

/**
 * Checks if a path pattern contains glob wildcard characters.
 */
const isGlobPattern = (pattern: string): boolean => {
  return pattern.includes('*') || pattern.includes('?')
}

/**
 * Extracts the base directory from a glob pattern.
 * Example: "/foo/bar/*.css" -> "/foo/bar"
 * Returns null if the glob is at the root level.
 */
const extractBaseDirectory = (globPattern: string): string | null => {
  const parts = globPattern.split(path.sep)
  const firstGlobIndex = parts.findIndex((part) => part.includes('*') || part.includes('?'))

  if (firstGlobIndex <= 0) {
    return null // Glob at root or not found
  }

  return parts.slice(0, firstGlobIndex).join(path.sep)
}

/**
 * Transforms user-provided patterns into actual filesystem paths for chokidar to watch.
 *
 * - Glob patterns: Extracts and watches the base directory (chokidar v4 doesn't support globs)
 * - Existing files: Watches the file directly
 * - Missing files: Watches the parent directory to detect when the file is created
 *
 * @param patterns File paths or glob patterns provided by the user
 * @returns Array of actual filesystem paths to watch
 */
const transformPatternsToWatchPaths = (patterns: string[]): string[] => {
  const watchPaths: string[] = []

  for (const pattern of patterns) {
    if (isGlobPattern(pattern)) {
      // watch the parent directory for any glob patterns
      const baseDir = extractBaseDirectory(pattern)
      if (baseDir && fs.existsSync(baseDir)) {
        watchPaths.push(baseDir)
      }
    } else if (fs.existsSync(pattern)) {
      // non-glob path that exists, watch it
      watchPaths.push(pattern)
    } else {
      // watch the parent of missing paths, so we get an event if the file is created
      const parentDir = path.dirname(pattern)
      if (fs.existsSync(parentDir)) {
        watchPaths.push(parentDir)
      }
    }
  }

  return watchPaths
}

/**
 * Creates a file system watcher that invokes a callback when files matching the patterns change.
 *
 * Supports:
 * - Individual file paths
 * - Glob patterns (converted to directory watches for chokidar v4 compatibility)
 * - Dynamic watch list updates
 * - Missing files (watches parent directory until they're created)
 *
 * @param patterns File paths or glob patterns to monitor
 * @param onChange Callback invoked when any monitored file changes
 * @param options Configuration options
 */
export const makeWatcher = (
  patterns: string[],
  onChange: () => void | Promise<void>,
  options: WatcherOptions = {},
): { start: () => Promise<void>; stop: () => Promise<void>; updateWatchList: (newPatterns: string[]) => void } => {
  const { debounceMs = 250, onChangeStarted, onChangeCompleted, onError, logger } = options

  let watcher: FSWatcher | null = null
  let isCallbackRunning = false
  let hasPendingCallback = false
  let debounceTimeoutId: NodeJS.Timeout | null = null
  let watchedPaths = new Set<string>()

  /**
   * Invokes the onChange callback, handling queuing if already running.
   */
  const invokeCallback = async (): Promise<void> => {
    if (isCallbackRunning) {
      hasPendingCallback = true
      return
    }

    isCallbackRunning = true

    try {
      await onChange()
      onChangeCompleted?.()
    } catch (error) {
      onError?.(error)
    } finally {
      isCallbackRunning = false

      // Process any changes that occurred during callback execution
      if (hasPendingCallback) {
        hasPendingCallback = false
        await invokeCallback()
      }
    }
  }

  /**
   * Handles file system change events with debouncing.
   */
  const handleFileChange = (filename: string): void => {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId)
    }

    debounceTimeoutId = setTimeout(() => {
      onChangeStarted?.(filename)
      void invokeCallback()
    }, debounceMs)
  }

  /**
   * Starts watching the configured patterns.
   * Returns a promise that resolves when the watcher is ready.
   */
  const start = (): Promise<void> => {
    return new Promise((resolve) => {
      const paths = transformPatternsToWatchPaths(patterns)

      watcher = chokidar.watch(paths, {
        ignoreInitial: true,
        persistent: true,
      })

      watchedPaths = new Set(paths)
      logger?.info(`[WATCH] Started watching ${paths.length} paths: ${paths.join(', ')}`)

      watcher.on('change', handleFileChange)
      watcher.on('add', handleFileChange)
      watcher.on('unlink', handleFileChange)
      watcher.on('ready', resolve)
    })
  }

  /**
   * Updates the watch list to a new set of patterns.
   * Efficiently adds/removes only the changed paths.
   */
  const updateWatchList = (newPatterns: string[]): void => {
    if (!watcher) {
      return
    }

    const newPaths = transformPatternsToWatchPaths(newPatterns)
    const newPathsSet = new Set(newPaths)

    const pathsToAdd = newPaths.filter((p) => !watchedPaths.has(p))
    const pathsToRemove = Array.from(watchedPaths).filter((p) => !newPathsSet.has(p))

    if (pathsToAdd.length > 0) {
      watcher.add(pathsToAdd)
      logger?.info(`[WATCH] Added ${pathsToAdd.length} paths: ${pathsToAdd.join(', ')}`)
    }

    if (pathsToRemove.length > 0) {
      watcher.unwatch(pathsToRemove)
      logger?.info(`[WATCH] Removed ${pathsToRemove.length} paths: ${pathsToRemove.join(', ')}`)
    }

    if (pathsToAdd.length > 0 || pathsToRemove.length > 0) {
      logger?.info(`[WATCH] Now watching ${newPaths.length} paths`)
    }

    watchedPaths = newPathsSet
  }

  /**
   * Stops the watcher, waiting for any in-progress callback to complete.
   */
  const stop = async (): Promise<void> => {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId)
    }

    // Wait for callback completion
    while (isCallbackRunning) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    if (watcher) {
      await watcher.close()
      watcher = null
    }

    watchedPaths.clear()
  }

  return { start, stop, updateWatchList }
}
