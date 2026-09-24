import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Where the watcher's Outbox is on this machine (the app and REAPER share it), and how to find
 * the rendered mix of a clip in it. The manifest the watcher writes beside the files is the
 * authority: a mix is only served once the watcher has recorded it as finished, so REAPER's
 * in-progress render (written in place, not atomically) is never handed out.
 */

export const defaultOutboxDir = (home = os.homedir()): string => {
  const configured = process.env.MUSIC_STUDIO_OUTBOX?.trim()
  if (configured === undefined || configured === '') {
    return path.join(home, 'Music', 'Studio Outbox')
  }
  // a leading ~ as in the watcher's config, which expands it the same way
  return configured.replace(/^~(?=$|[/\\])/, home)
}

/**
 * The watcher's file-name sanitizer, character for character (its Lua classes are ASCII-only,
 * so this one is too), so folder names match what it wrote.
 */
const UNSAFE = '<>:"/\\|?*$'
const isUnsafe = (char: string) => UNSAFE.includes(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f

export const safeName = (text: string): string =>
  text
    .replace(/./gsu, (char) => (isUnsafe(char) ? ' ' : char))
    .replace(/[ \t\n\v\f\r]+/g, ' ')
    .replace(/^[ \t\n\v\f\r]+/, '')
    .replace(/[ \t\n\v\f\r.]+$/, '')

const MIME_BY_EXTENSION: Record<string, string> = {
  '.wav': 'audio/wav',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

/** Media type for a rendered mix, whatever format the project renders in. */
export const mixContentType = (file: string): string =>
  MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? 'application/octet-stream'

interface Manifest {
  clips?: Record<
    string,
    | {
        number?: unknown
        render?: { mix?: unknown } | null
        createdAt?: unknown
        starred?: unknown
        archived?: unknown
      }
    | undefined
  >
}

/** What the watcher's library knows about a clip beyond its region: when it was made, and his flags. */
export interface ClipInfo {
  createdAt?: string
  starred: boolean
  deleted: boolean
}

/** How often the manifest is re-checked for changes, at most. */
const MANIFEST_CHECK_MS = 250

/**
 * Reads clip facts from the project's manifest, by clip number. The file is re-read only when
 * its modification time changes, checked at most every quarter second, so polling the state
 * at 20 Hz costs nothing between edits.
 */
export const createClipInfoReader = (outboxDir: string) => {
  let checkedAt = -Infinity
  let seen = { file: '', mtime: -1 }
  let cache = new Map<number, ClipInfo>()
  const parse = (text: string) => {
    const infos = new Map<number, ClipInfo>()
    let manifest: Manifest
    try {
      manifest = JSON.parse(text) as Manifest
    } catch {
      return infos
    }
    for (const entry of Object.values(manifest.clips ?? {})) {
      if (typeof entry?.number !== 'number') {
        continue
      }
      infos.set(entry.number, {
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : undefined,
        starred: entry.starred === true,
        deleted: entry.archived === true,
      })
    }
    return infos
  }
  return async (projectName: string): Promise<Map<number, ClipInfo>> => {
    const file = path.join(outboxDir, safeName(projectName), 'manifest.json')
    const now = Date.now()
    if (file === seen.file && now - checkedAt < MANIFEST_CHECK_MS) {
      return cache
    }
    checkedAt = now
    try {
      const stat = await fs.stat(file)
      if (file !== seen.file || stat.mtimeMs !== seen.mtime) {
        cache = parse(await fs.readFile(file, 'utf8'))
        seen = { file, mtime: stat.mtimeMs }
      }
    } catch {
      cache = new Map()
      seen = { file, mtime: -1 }
    }
    return cache
  }
}

/**
 * The finished rendered mix of clip `number` in `projectName`'s Outbox folder, from the manifest
 * there, or undefined when there is none yet. Only a file the watcher recorded is ever returned.
 */
export const findClipMix = async (
  outboxDir: string,
  projectName: string,
  number: number,
): Promise<string | undefined> => {
  const dir = path.join(outboxDir, safeName(projectName))
  let manifest: Manifest
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')) as Manifest
  } catch {
    return undefined
  }
  const entry = manifest.clips?.[String(number)]
  const mix = entry?.render?.mix
  if (typeof mix !== 'string' || mix === '' || mix === '.' || mix === '..' || path.basename(mix) !== mix) {
    return undefined
  }
  return path.join(dir, mix)
}
