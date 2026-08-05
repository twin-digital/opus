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

/** Takes the attach lock for a project, or refuses naming the run that holds it. */
export const acquireAttachLock = (_project: string): Promise<AttachLock> => {
  throw new Error('not implemented: acquireAttachLock')
}
