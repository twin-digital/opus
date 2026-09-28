import { fileURLToPath } from 'node:url'

/**
 * The watcher's directory, which installs into REAPER as a whole.
 */
export const watcherDirectory = fileURLToPath(new URL('../lua/', import.meta.url))

/**
 * The watcher script REAPER runs.
 */
export const watcherScript = fileURLToPath(new URL('../lua/watcher.lua', import.meta.url))
