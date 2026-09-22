import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Where the watcher's Outbox is on this machine (the app and REAPER share it), and how to find
 * the rendered mix of a clip in it. Mirrors the watcher's naming: `<outbox>/<project>/<date> -
 * <0012> - <name>.<ext>`.
 */

export const defaultOutboxDir = (home = os.homedir()): string => {
  const configured = process.env.MUSIC_STUDIO_OUTBOX?.trim()
  return configured !== undefined && configured !== '' ? configured : path.join(home, 'Music', 'Studio Outbox')
}

/** The watcher's file-name sanitizer, so folder names match what it wrote. */
export const safeName = (text: string): string =>
  text
    .replace(/[<>:"/\\|?*$\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/, '')
    .replace(/[\s.]+$/, '')

/**
 * The rendered mix of clip `number` in `projectName`'s Outbox folder, or undefined when there is
 * none yet. Only files the watcher named for that clip are ever returned.
 */
export const findClipMix = async (
  outboxDir: string,
  projectName: string,
  number: number,
): Promise<string | undefined> => {
  const dir = path.join(outboxDir, safeName(projectName))
  const marker = ` - ${String(number).padStart(4, '0')} - `
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return undefined
  }
  const mix = names.find(
    (name) => name.includes(marker) && !name.endsWith('.mid') && !name.endsWith('.json') && !name.endsWith('.tmp'),
  )
  return mix === undefined ? undefined : path.join(dir, mix)
}
