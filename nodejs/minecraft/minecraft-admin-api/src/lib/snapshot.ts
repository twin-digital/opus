import { copyFile, mkdir, stat, truncate } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { SAVE_QUERY_TIMEOUT_MS, SERVER_ROOT } from '../config/index.js'
import type { ConsoleBroker } from './console-broker.js'

const READY_MARKER = /Files are now ready to be copied/
const SAVE_QUERY_POLL_MS = 1_000

export interface SnapshotResult {
  /** Number of world files staged. */
  copied: number
  /** Absolute directory the world tree was staged under. */
  destDir: string
}

/**
 * Stage a byte-consistent copy of the running world into `destDir`, using
 * bedrock's `save hold` / `save query` / `save resume` protocol.
 *
 * The entire protocol runs as ONE console critical section ({@link
 * ConsoleBroker.runExclusive}), so no other console command can interleave with
 * the hold — the class of race that corrupted backups and stalled the UI. And
 * `save resume` is issued from a `finally`, so a copy error, a timeout, or a
 * caller disconnect can never leave the server with saves held. (The broker is
 * a single supervised process, so unlike the old bash primitive there is no
 * SIGKILL-skips-the-trap path; a hard crash is covered by the startup
 * {@link ConsoleBroker.reapDanglingHold}.)
 *
 * The consistency contract: `save query` names each file and the length to
 * which it is consistent. The server keeps mutating past that length, so we
 * copy each named file and truncate it to the named length.
 */
export const createSnapshot = async (broker: ConsoleBroker, destDir: string): Promise<SnapshotResult> =>
  broker.runExclusive(async () => {
    const offset = await broker.currentLogSize()
    await broker.sendRaw(['save', 'hold'])
    try {
      const fileList = await pollForFileList(broker, offset)
      const copied = await stageFiles(fileList, destDir)
      if (copied === 0) {
        throw new Error('save query returned a file list but no files were staged')
      }
      return { copied, destDir }
    } finally {
      // MUST run even on error — releases the hold so the server resumes saving.
      await broker.sendRaw(['save', 'resume'])
    }
  })

/** Poll `save query` until the server prints the ready marker + file list. */
const pollForFileList = async (broker: ConsoleBroker, offset: number): Promise<string> => {
  const deadline = Date.now() + SAVE_QUERY_TIMEOUT_MS
  do {
    await broker.sendRaw(['save', 'query'])
    // The marker and the file list are separate writes; give them a beat to land.
    const match = await broker.waitFor(READY_MARKER, offset, SAVE_QUERY_POLL_MS)
    if (match) {
      // The file list is the first non-empty line AFTER the marker line.
      const tailAfterMarker = match.input!.slice(match.index! + match[0].length)
      const line = tailAfterMarker
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0)
      if (line) {
        return line
      }
    }
  } while (Date.now() < deadline)
  throw new Error(`save query did not return a file list within ${SAVE_QUERY_TIMEOUT_MS}ms`)
}

/**
 * Copy each `<relpath>:<length>` entry into `destDir`, truncated to the named
 * length. `serverRoot/worlds` symlinks to the live worlds dir, so this resolves
 * to the on-disk files.
 */
const stageFiles = async (fileList: string, destDir: string): Promise<number> => {
  let copied = 0
  for (const rawEntry of fileList.split(',')) {
    const entry = rawEntry.trim()
    if (!entry) {
      continue
    }
    const lastColon = entry.lastIndexOf(':')
    if (lastColon < 0) {
      continue
    }
    const lengthText = entry.slice(lastColon + 1).trim()
    let relPath = entry.slice(0, lastColon).trim()
    const length = Number(lengthText)
    if (!Number.isInteger(length) || length < 0) {
      continue
    }
    // Newer bedrock returns paths relative to the worlds dir (no `worlds/`
    // prefix); older builds include it. Normalize to exactly one prefix.
    if (!relPath.startsWith('worlds/')) {
      relPath = `worlds/${relPath}`
    }
    const src = join(SERVER_ROOT, relPath)
    const dest = join(destDir, relPath)
    try {
      await stat(src)
    } catch {
      continue // server-listed file missing on disk — skip, don't abort.
    }
    await mkdir(dirname(dest), { recursive: true })
    // Copy first (preserves the file even if the server mutates it before the
    // truncate), then truncate to the consistency boundary.
    await copyFile(src, dest)
    await truncate(dest, length)
    copied += 1
  }
  return copied
}
