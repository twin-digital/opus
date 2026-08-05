import type { CommandContext } from '../start/start.js'

/**
 * Removes the volume and every world on it — the only command that loses an author's work. It
 * names what it is about to remove and asks before doing it, and where nothing can be asked it
 * does nothing.
 */
export const destroy = (_context: CommandContext): Promise<void> => {
  throw new Error('not implemented: destroy')
}
