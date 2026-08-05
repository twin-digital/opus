import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Whether the bytes already at `target` are the ones given. Absent or unreadable counts as differing. */
export async function bytesMatch(target: string, contents: Buffer): Promise<boolean> {
  try {
    return (await readFile(target)).equals(contents)
  } catch {
    return false
  }
}

/**
 * Writes `contents` at `target` only where the bytes there differ, creating the directories the
 * path needs. An unchanged file keeps its modification time, which is what a watching consumer
 * keys on.
 */
export async function writeIfChanged(target: string, contents: Buffer): Promise<void> {
  if (await bytesMatch(target, contents)) {
    return
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, contents)
}

/** Every file under `dir` as an absolute path, recursively; empty where the directory is absent. */
export async function listFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(child)))
    } else {
      files.push(child)
    }
  }
  return files
}

/**
 * Deletes every file under `dir` that `keep` does not name, and every directory left holding
 * nothing. `dir` itself stays whether or not it ends up empty.
 */
export async function pruneTree(dir: string, keep: ReadonlySet<string>): Promise<void> {
  await pruneInto(dir, keep)
}

/** Prunes one directory, and reports whether anything is left in it. */
async function pruneInto(dir: string, keep: ReadonlySet<string>): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }

  let remaining = 0
  for (const entry of entries) {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (await pruneInto(child, keep)) {
        remaining += 1
      } else {
        await rm(child, { recursive: true, force: true })
      }
    } else if (keep.has(child)) {
      remaining += 1
    } else {
      await rm(child, { force: true })
    }
  }

  return remaining > 0
}
