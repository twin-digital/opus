import type { CommandContext } from '../start/start.js'

/**
 * Takes the container down and leaves the volume standing, so every world on it survives to the
 * next start. The server goes down through its own console `stop`, waited for, so the world is
 * written first.
 */
export const stop = (_context: CommandContext): Promise<void> => {
  throw new Error('not implemented: stop')
}
