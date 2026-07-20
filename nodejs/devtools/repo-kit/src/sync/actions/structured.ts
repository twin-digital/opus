import fsP from 'node:fs/promises'
import path from 'node:path'
import { applyPatch, tryGetValueByPointer, type SetMatchingPredicate } from '@twin-digital/json-patch-x'
import yaml from 'yaml'
import type { SyncResult } from '../sync-result.js'

/**
 * Reads a value out of a structured-config file (JSON or YAML) at a JSON Pointer.
 */
export interface StructuredSource {
  /** Project-relative path of the JSON or YAML file to read. */
  file: string

  /** JSON Pointer to the value within `file`. */
  pointer: string

  /** Value to use when `pointer` resolves to nothing. If omitted, a missing source value is an error. */
  default?: unknown
}

/**
 * Addresses element(s) of an array in a target JSON file by a value predicate (rather than a brittle index), and the
 * child pointer within each match at which to write.
 */
export interface ArrayTarget {
  /** Project-relative path of the JSON file to update. */
  file: string

  /** JSON Pointer to the array within `file` whose elements are candidates. */
  array: string

  /** Predicate selecting which element(s) of `array` to update. */
  where: SetMatchingPredicate

  /** JSON Pointer, relative to each matched element, at which to write the value. */
  set: string
}

/**
 * Addresses a single value in a target JSON file by a JSON Pointer, for writing into an object (rather than an array
 * element). Use when the destination is a fixed field — e.g. a Bedrock manifest's `/header/description` — where there
 * is no array to match against.
 */
export interface PointerTarget {
  /** Project-relative path of the JSON file to update. */
  file: string

  /** JSON Pointer within `file` at which to write the value. Parent objects must already exist. */
  pointer: string
}

/**
 * Parses a structured-config file by extension. YAML is a superset of JSON, but parsing each with its own parser keeps
 * error messages accurate and avoids surprises with edge-case JSON.
 */
const parseStructured = (file: string, content: string): unknown =>
  file.endsWith('.json') ? (JSON.parse(content) as unknown) : (yaml.parse(content) as unknown)

/**
 * Resolves `source.pointer` within `source.file`, falling back to `source.default`. Throws when the pointer resolves
 * to nothing and no default was supplied (a silent empty result would mask a misconfigured pointer).
 */
export const readSourceValue = async (workspacePath: string, source: StructuredSource): Promise<unknown> => {
  const sourcePath = path.join(workspacePath, source.file)
  const sourceDocument = parseStructured(source.file, await fsP.readFile(sourcePath, 'utf-8'))

  const found = tryGetValueByPointer(sourceDocument, source.pointer)
  const value = found ?? source.default
  if (value === undefined || value === null) {
    throw new Error(`'${source.file}' has no value at '${source.pointer}', and no default was provided`)
  }
  return value
}

/**
 * Writes `value` into the element(s) of `target.array` selected by `target.where` (via `setMatching`), so the
 * destination is addressed by value rather than by index. Idempotent: writes only when the resulting document differs
 * from what is already on disk. The parsed documents are compared (not the file text) so formatting — owned by
 * Prettier via a hook — never triggers a write that would fight the formatter.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const writeArrayTarget = async (
  workspacePath: string,
  target: ArrayTarget,
  value: unknown,
): Promise<SyncResult> => {
  const targetPath = path.join(workspacePath, target.file)
  const original = JSON.parse(await fsP.readFile(targetPath, 'utf-8')) as object
  const patched = applyPatch(original, [
    { opx: 'setMatching', path: target.array, where: target.where, set: target.set, value },
  ])

  if (JSON.stringify(patched) === JSON.stringify(original)) {
    return { result: 'skipped' }
  }

  await fsP.writeFile(targetPath, `${JSON.stringify(patched, null, 2)}\n`, 'utf-8')
  return {
    changedFiles: [target.file],
    result: 'ok',
  }
}

/**
 * Writes `value` at `target.pointer` in `target.file` via an `add` operation (which creates or replaces the member,
 * provided its parent object exists). Idempotent: writes only when the resulting document differs from what is already
 * on disk, comparing the parsed documents so Prettier-owned formatting never triggers a spurious write. Mirrors
 * {@link writeArrayTarget} for object destinations.
 *
 * @returns An `ok` result if the target file changed, or `skipped` if it was already in sync.
 */
export const writePointerTarget = async (
  workspacePath: string,
  target: PointerTarget,
  value: unknown,
): Promise<SyncResult> => {
  const targetPath = path.join(workspacePath, target.file)
  const original = JSON.parse(await fsP.readFile(targetPath, 'utf-8')) as object
  const patched = applyPatch(original, [{ op: 'add', path: target.pointer, value }])

  if (JSON.stringify(patched) === JSON.stringify(original)) {
    return { result: 'skipped' }
  }

  await fsP.writeFile(targetPath, `${JSON.stringify(patched, null, 2)}\n`, 'utf-8')
  return {
    changedFiles: [target.file],
    result: 'ok',
  }
}
