import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * One attached run per compose project. Two loops watching one server would race each other's
 * reconciles and restarts, so the second refuses and names the first.
 */
export interface AttachLock {
  release(): Promise<void>
}

/** Another harness is already attached to this workspace's server. */
export class AlreadyAttachedError extends Error {
  constructor(project: string, pid: number, since: string) {
    super(`another harness (pid ${pid}, attached ${since}) is already watching the '${project}' server`)
    this.name = 'AlreadyAttachedError'
  }
}

/** What an attached run records about itself. */
export interface AttachRecord {
  pid: number
  since: string
}

/** Whether a recorded holder is still running; a stale record does not block a new attach. */
export const holderIsAlive = (record: AttachRecord): boolean => {
  try {
    process.kill(record.pid, 0)
    return true
  } catch {
    return false
  }
}

/** Where the lock for a project lives: outside the author's workspace, keyed by project. */
export const attachLockPath = (project: string): string => join(tmpdir(), 'mc-dev-server', project, 'attach.json')

/** Reads a lock file, treating anything unreadable as no holder at all. */
const readRecord = async (path: string): Promise<AttachRecord | undefined> => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<AttachRecord>
    if (typeof parsed.pid !== 'number' || typeof parsed.since !== 'string') {
      return undefined
    }
    return { pid: parsed.pid, since: parsed.since }
  } catch {
    return undefined
  }
}

/**
 * Takes the attach lock for a project, or refuses naming the run that holds it. A record left by a
 * run that is no longer alive does not block a new attach.
 */
export const acquireAttachLock = async (project: string): Promise<AttachLock> => {
  const path = attachLockPath(project)
  await mkdir(dirname(path), { recursive: true })
  const record: AttachRecord = { pid: process.pid, since: new Date().toISOString() }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' })
      return { release: () => rm(path, { force: true }) }
    } catch {
      const holder = await readRecord(path)
      if (holder !== undefined && holderIsAlive(holder)) {
        throw new AlreadyAttachedError(project, holder.pid, holder.since)
      }
      await rm(path, { force: true })
    }
  }

  throw new Error(`could not take the attach lock at ${path}`)
}
