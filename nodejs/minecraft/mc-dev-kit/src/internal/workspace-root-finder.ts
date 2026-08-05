import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { WorkspaceRoot } from '../types.js'
import { messageOf, parseJson } from './json.js'

/** The pnpm marker under either spelling; presence of one makes the directory a root. */
const PNPM_MARKERS = ['pnpm-workspace.yaml', 'pnpm-workspace.yml'] as const

/** The errors that mean the file is not here, rather than here and unreadable. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR', 'EISDIR'])

/**
 * Climbs from `from` to the filesystem root, returning the first directory that is a workspace
 * root — one holding a pnpm marker, or a `package.json` declaring `workspaces`.
 *
 * @param from - the absolute path the ascent starts at, itself a candidate
 * @returns the root and the name of the package there, or `undefined` where no ancestor is one
 * @throws naming the file when a marker on the ascent cannot be read or parsed
 */
export async function findWorkspaceRoot(from: string): Promise<WorkspaceRoot | undefined> {
  let dir = from
  for (;;) {
    if (await isWorkspaceRoot(dir)) {
      return { root: dir, packageName: await rootPackageName(dir) }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/** A pnpm marker under either spelling, else a `package.json` declaring `workspaces`. */
async function isWorkspaceRoot(dir: string): Promise<boolean> {
  for (const marker of PNPM_MARKERS) {
    if ((await readParsed(path.join(dir, marker), parseYaml)) !== undefined) {
      return true
    }
  }
  const packageJson = await readPackageJson(dir)
  return packageJson?.workspaces !== undefined
}

/** The root package's declared name, or the root directory's basename. */
async function rootPackageName(dir: string): Promise<string> {
  const packageJson = await readPackageJson(dir)
  const declared = packageJson?.name
  return typeof declared === 'string' ? declared : path.basename(dir)
}

async function readPackageJson(dir: string): Promise<Record<string, unknown> | undefined> {
  const parsed = await readParsed(path.join(dir, 'package.json'), parseJson)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ?
      (parsed as Record<string, unknown>)
    : undefined
}

/**
 * Reads and parses one marker. `undefined` where the file is not there; an unreadable or malformed
 * one throws naming the file, since a marker the kit cannot read is not an answer.
 */
async function readParsed(file: string, parse: (text: string) => unknown): Promise<unknown> {
  let contents: string
  try {
    contents = await readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== undefined && ABSENT.has(code)) {
      return undefined
    }
    throw new Error(`${file} could not be read: ${messageOf(error)}`, { cause: error })
  }

  try {
    // an empty marker file parses to nothing, and is still a marker
    return parse(contents) ?? {}
  } catch (error) {
    throw new Error(`${file} could not be parsed: ${messageOf(error)}`, { cause: error })
  }
}
