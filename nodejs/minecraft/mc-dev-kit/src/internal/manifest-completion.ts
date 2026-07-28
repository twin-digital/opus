import semver from 'semver'
import type { Problem } from '../types.js'
import type { CandidatePackage, WorkingEntry } from './candidate.js'
import { isRecord } from './json.js'
import { classifyDependency } from './manifest-shape.js'

/** The values that leave a field unspecified without omitting it. */
function isPlaceholder(value: unknown): boolean {
  return (
    value === '' ||
    value === '0.0.0' ||
    (Array.isArray(value) && value.length === 3 && value.every((part) => part === 0))
  )
}

const isUnspecified = (value: unknown): boolean => value === undefined || isPlaceholder(value)

/**
 * Fills in what the owning package already knows, on every located entry at once.
 *
 * Every pack's header uuid is indexed first, so a dependency naming a pack in the workspace can be
 * recognised; then each entry's `header.name`, `header.version`, and the version of each
 * `dependencies` entry naming a pack in the set are written. The declared `format_version` is left
 * as it stands and no field is translated between format versions.
 *
 * A source manifest is partial by design, so a field completion writes that the source already
 * specified is a problem: `header-name-specified`, `header-version-specified`, and
 * `dependency-version-specified`. A field is unspecified when it is absent or holds a placeholder
 * — the empty string, `'0.0.0'`, or `[0, 0, 0]` — and an array version at `format_version` 3 is
 * `array-version-at-format-version-3` whether or not it is a placeholder.
 *
 * The package a completion reads from is reported too: a package declaring no string `name` is
 * `package-name-missing`, and one whose `version` is missing or is not a version is
 * `package-version-missing` or `package-version-invalid`, whose `packageDir` names the package at
 * fault — the entry's own when completing `header.version`, the depended-on pack's when completing
 * a dependency. A `dependencies` entry carrying both `uuid` and `module_name`, or neither, is
 * `dependency-entry-malformed` and is neither completed nor resolved.
 *
 * Entries the uuid index does not claim pass through untouched and must carry their own version: a
 * `module_name` entry with none is `external-dependency-version-missing`, and a `uuid` entry
 * matching no pack and carrying none is `dependency-unsatisfied`.
 *
 * Mutates each entry's `manifest` in place and appends to its `problems`.
 */
export function completeManifests(entries: readonly WorkingEntry[]): void {
  const byUuid = new Map<string, WorkingEntry>()
  for (const entry of entries) {
    const uuid = sourceUuid(entry)
    if (uuid !== undefined && !byUuid.has(uuid)) {
      byUuid.set(uuid, entry)
    }
  }

  for (const entry of entries) {
    // a package that cannot name itself is a fault of the package, whatever its manifest holds
    if (typeof entry.package.packageJson.name !== 'string') {
      entry.problems.push({
        code: 'package-name-missing',
        message: `the package at ${entry.packageDir} declares no name, so the pack cannot name its owning package`,
      })
    }
    completeEntry(entry, byUuid)
  }
}

/** The lowercased header uuid a manifest claims, where it claims one at all. */
export function sourceUuid(entry: WorkingEntry): string | undefined {
  const manifest = entry.manifest
  if (!isRecord(manifest) || !isRecord(manifest.header)) {
    return undefined
  }
  const uuid = manifest.header.uuid
  return typeof uuid === 'string' ? uuid.toLowerCase() : undefined
}

function completeEntry(entry: WorkingEntry, byUuid: Map<string, WorkingEntry>): void {
  const manifest = entry.manifest
  if (!isRecord(manifest)) {
    return
  }

  // a format version the kit cannot read restricts nothing, as a missing one does
  const formatVersion = entry.formFaults.has('format_version') ? undefined : manifest.format_version
  completeHeader(entry, manifest, formatVersion)
  completeDependencies(entry, manifest, formatVersion, byUuid)
}

/** Writes the header's name and version, whatever the source held. */
function completeHeader(entry: WorkingEntry, manifest: Record<string, unknown>, formatVersion: unknown): void {
  if (manifest.header !== undefined && !isRecord(manifest.header)) {
    return
  }
  const header = isRecord(manifest.header) ? manifest.header : {}
  manifest.header = header

  if (!entry.formFaults.has('header.name')) {
    if (header.name !== undefined && header.name !== '') {
      entry.problems.push({
        code: 'header-name-specified',
        message: 'header.name is completed from the owning package and must not be specified',
      })
    }
    header.name = completedName(entry)
  }

  if (entry.formFaults.has('header.version')) {
    return
  }

  if (formatVersion === 3 && Array.isArray(header.version)) {
    entry.problems.push({
      code: 'array-version-at-format-version-3',
      message: 'a version must be a SemVer string at format_version 3',
      field: 'header.version',
    })
  }
  if (!isUnspecified(header.version)) {
    entry.problems.push({
      code: 'header-version-specified',
      message: 'header.version is completed from the owning package and must not be specified',
    })
  }

  const version = packageVersion(entry.package, 'header.version', entry.problems)
  if (version !== undefined) {
    header.version = version
  } else {
    delete header.version
  }
}

/** `productName` where it is a non-empty string, otherwise the scope-stripped package name. */
function completedName(entry: WorkingEntry): string {
  const { name, productName } = entry.package.packageJson
  if (typeof productName === 'string' && productName !== '') {
    return productName
  }
  if (typeof name !== 'string') {
    return entry.packageName
  }
  return name.startsWith('@') && name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
}

/** Completes the version of every dependency naming a pack in the set, reporting the rest. */
function completeDependencies(
  entry: WorkingEntry,
  manifest: Record<string, unknown>,
  formatVersion: unknown,
  byUuid: Map<string, WorkingEntry>,
): void {
  const dependencies = manifest.dependencies
  if (!Array.isArray(dependencies)) {
    return
  }

  dependencies.forEach((dependency, index) => {
    if (!isRecord(dependency)) {
      return
    }
    const field = `dependencies[${String(index)}]`
    const names = classifyDependency(dependency)

    if (names === 'malformed') {
      entry.problems.push({
        code: 'dependency-entry-malformed',
        message: `${field} carries ${dependency.uuid === undefined ? 'neither a uuid nor a module_name' : 'both a uuid and a module_name'}`,
        field,
      })
      return
    }

    // a faulted uuid matches no pack, so every later check on the entry is skipped with it
    if (entry.formFaults.has(`${field}.uuid`)) {
      return
    }
    if (entry.formFaults.has(`${field}.version`)) {
      return
    }

    const uuid = names === 'pack' ? (dependency.uuid as string) : undefined
    const moduleName = names === 'module' ? (dependency.module_name as string) : undefined

    if (formatVersion === 3 && Array.isArray(dependency.version)) {
      entry.problems.push({
        code: 'array-version-at-format-version-3',
        message: 'a version must be a SemVer string at format_version 3',
        field: `${field}.version`,
      })
    }

    if (moduleName !== undefined) {
      if (!entry.formFaults.has(`${field}.module_name`) && isUnspecified(dependency.version)) {
        entry.problems.push({
          code: 'external-dependency-version-missing',
          message: `${field} names the built-in module ${moduleName}, which the workspace does not complete, so it must carry its own version`,
          field: `${field}.version`,
          moduleName,
        })
      }
      return
    }

    if (uuid === undefined) {
      return
    }

    const target = byUuid.get(uuid.toLowerCase())
    if (target === undefined) {
      if (isUnspecified(dependency.version)) {
        entry.problems.push({
          code: 'dependency-unsatisfied',
          message: `${field} names no pack in the workspace and carries no version — either the uuid is wrong, or an external dependency is missing its version`,
          field,
          uuid,
        })
      }
      return
    }

    if (!isUnspecified(dependency.version)) {
      entry.problems.push({
        code: 'dependency-version-specified',
        message: `${field} names a pack in the workspace, so its version is completed and must not be specified`,
        field: `${field}.version`,
        uuid,
      })
    }

    const version = packageVersion(target.package, `${field}.version`, entry.problems)
    if (version !== undefined) {
      dependency.version = version
    } else {
      // never leave a placeholder standing in for a version completion could not produce
      delete dependency.version
    }
  })
}

/** The owning package's version as a SemVer string, reporting a missing or malformed one. */
function packageVersion(candidate: CandidatePackage, field: string, problems: Problem[]): string | undefined {
  const declared = candidate.packageJson.version
  if (declared === undefined || declared === null) {
    problems.push({
      code: 'package-version-missing',
      message: `the package at ${candidate.packageDir} declares no version`,
      field,
      packageDir: candidate.packageDir,
    })
    return undefined
  }

  const valid = typeof declared === 'string' ? semver.valid(declared) : null
  if (valid === null) {
    problems.push({
      code: 'package-version-invalid',
      message: `the package at ${candidate.packageDir} declares a version that is not a version`,
      field,
      packageDir: candidate.packageDir,
      value: typeof declared === 'string' ? declared : JSON.stringify(declared),
    })
    return undefined
  }
  return valid
}
