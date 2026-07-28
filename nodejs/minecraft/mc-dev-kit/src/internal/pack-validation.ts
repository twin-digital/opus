import type { PackKind } from '../types.js'
import type { WorkingEntry } from './candidate.js'
import { isRecord } from './json.js'
import { sourceUuid } from './manifest-completion.js'
import { classifyDependency } from './manifest-shape.js'

/** The module types that carry a kind. Every other type is ignored, neither corroborating nor a fault. */
const CORROBORATING: Record<PackKind, readonly string[]> = {
  behavior: ['data', 'script'],
  resource: ['resources'],
}

/**
 * Runs the checks that decide an entry's status, per pack and then across the set.
 *
 * Per pack: `manifest-missing-uuid` where the manifest declares no `header.uuid`,
 * `module-missing-type` for a module declaring no `type`, `kind-not-corroborated` where no module
 * carries the kind the directory declares — `data` or `script` for a behavior pack, `resources`
 * for a resource pack — and `foreign-kind-module` for a module of the other kind. Any other module
 * type is ignored: the set of module types is not enumerable, so validating against a published
 * list would report a problem against Microsoft's own reference pack.
 *
 * Across the set: `duplicate-uuid` where two or more packs claim one header uuid, every claimant
 * invalid with no preference between them, and `dependency-invalid` where a `dependencies` entry
 * names a pack in the set that is itself invalid. The set-wide pass repeats until no entry changes
 * status, so invalidity is transitive along dependency edges; a cycle among packs that are
 * otherwise sound stays valid, since nothing invalid seeds it.
 *
 * Appends to each entry's `problems`.
 */
export function validatePacks(entries: readonly WorkingEntry[]): void {
  for (const entry of entries) {
    validatePack(entry)
  }
  reportDuplicateUuids(entries)
  propagateInvalidity(entries)
}

function validatePack(entry: WorkingEntry): void {
  const manifest = entry.manifest
  if (!isRecord(manifest)) {
    return
  }

  if ((manifest.header === undefined || isRecord(manifest.header)) && !entry.formFaults.has('header.uuid')) {
    if (sourceUuid(entry) === undefined) {
      entry.problems.push({
        code: 'manifest-missing-uuid',
        message: 'the manifest declares no header.uuid, so the pack has no identity',
      })
    }
  }

  if (manifest.modules !== undefined && !Array.isArray(manifest.modules)) {
    return
  }

  const modules: unknown[] = Array.isArray(manifest.modules) ? manifest.modules : []
  const foreign = entry.kind === 'behavior' ? CORROBORATING.resource : CORROBORATING.behavior
  let corroborated = false
  // the kit cannot know what a module whose type faulted would have corroborated
  const typeFaulted = modules.some((_module, index) => entry.formFaults.has(`modules[${String(index)}].type`))

  for (const [index, module] of modules.entries()) {
    if (!isRecord(module)) {
      continue
    }
    const field = `modules[${String(index)}]`
    const type = module.type
    if (typeof type !== 'string') {
      if (!entry.formFaults.has(`${field}.type`)) {
        entry.problems.push({
          code: 'module-missing-type',
          message: `${field} declares no type; every module must`,
          field,
        })
      }
      continue
    }
    if (CORROBORATING[entry.kind].includes(type)) {
      corroborated = true
    } else if (foreign.includes(type) && !typeFaulted) {
      entry.problems.push({
        code: 'foreign-kind-module',
        message: `${field} is a ${type} module, which belongs to the other kind of pack`,
        field,
        type,
      })
    }
  }

  if (!corroborated && !typeFaulted) {
    entry.problems.push({
      code: 'kind-not-corroborated',
      message: `no module corroborates the ${entry.kind} pack its directory declares`,
    })
  }
}

/** Every claimant of a shared uuid is invalid, with no preference between them. */
function reportDuplicateUuids(entries: readonly WorkingEntry[]): void {
  const claimants = new Map<string, WorkingEntry[]>()
  for (const entry of entries) {
    const uuid = sourceUuid(entry)
    if (uuid === undefined) {
      continue
    }
    const claiming = claimants.get(uuid) ?? []
    claiming.push(entry)
    claimants.set(uuid, claiming)
  }

  for (const [uuid, claiming] of claimants) {
    if (claiming.length < 2) {
      continue
    }
    const sourceDirs = claiming.map((entry) => entry.sourceDir)
    for (const entry of claiming) {
      entry.problems.push({
        code: 'duplicate-uuid',
        message: `the uuid ${uuid} is claimed by ${String(claiming.length)} packs: ${sourceDirs.join(', ')}`,
        uuid,
        claimants: [...sourceDirs],
      })
    }
  }
}

/** Invalidity travels along dependency edges until no entry changes status. */
function propagateInvalidity(entries: readonly WorkingEntry[]): void {
  const byUuid = new Map<string, WorkingEntry>()
  for (const entry of entries) {
    const uuid = sourceUuid(entry)
    if (uuid !== undefined && !byUuid.has(uuid)) {
      byUuid.set(uuid, entry)
    }
  }

  const reported = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    entries.forEach((entry, entryIndex) => {
      const manifest = entry.manifest
      const dependencies = isRecord(manifest) ? manifest.dependencies : undefined
      if (!Array.isArray(dependencies)) {
        return
      }

      dependencies.forEach((dependency, index) => {
        // a malformed entry is never resolved, and neither is one whose uuid faulted
        if (
          !isRecord(dependency) ||
          classifyDependency(dependency) !== 'pack' ||
          entry.formFaults.has(`dependencies[${String(index)}].uuid`) ||
          typeof dependency.uuid !== 'string'
        ) {
          return
        }
        const target = byUuid.get(dependency.uuid.toLowerCase())
        if (target === undefined || target === entry || target.problems.length === 0) {
          return
        }

        const key = `${String(entryIndex)}:${String(index)}`
        if (reported.has(key)) {
          return
        }
        reported.add(key)

        const wasValid = entry.problems.length === 0
        entry.problems.push({
          code: 'dependency-invalid',
          message: `dependencies[${String(index)}] names ${target.sourceDir}, which is itself invalid`,
          field: `dependencies[${String(index)}]`,
          uuid: dependency.uuid,
        })
        changed ||= wasValid
      })
    })
  }
}
