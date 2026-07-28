import type { Problem } from '../types.js'
import { isRecord } from './json.js'

/** Every shape fault reports the one code, located by its free-form `field`. */
export type ShapeProblem = Extract<Problem, { code: 'manifest-shape-invalid' }>

/** What a manifest's containers and field forms came to, and what a later stage must skip. */
export interface ManifestShape {
  problems: ShapeProblem[]
  /** dotted paths of the fields whose form the source contradicted */
  faults: Set<string>
}

/** Which of the two fields a dependency entry names. */
export type DependencyShape = 'pack' | 'module' | 'malformed'

/**
 * Reads the dependency discriminator: presence of `uuid` and of `module_name`, before either has
 * been form-checked, since which fields the entry should carry is what the discriminator settles.
 */
export function classifyDependency(dependency: Record<string, unknown>): DependencyShape {
  const namesPack = dependency.uuid !== undefined
  const namesModule = dependency.module_name !== undefined
  if (namesPack === namesModule) {
    return 'malformed'
  }
  return namesPack ? 'pack' : 'module'
}

const isString = (value: unknown): boolean => typeof value === 'string'

const isFormatVersion = (value: unknown): boolean => typeof value === 'number' || typeof value === 'string'

/** A version is a SemVer string or a `[major, minor, revision]` array — form only, never value. */
const isVersion = (value: unknown): boolean =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === 'number'))

/**
 * Checks a parsed manifest against the shapes the format documents, in two passes.
 *
 * The container pass takes the manifest root, `header`, `modules`, and `dependencies`; the form
 * pass then takes every field `PackManifest` declares, inside the containers that survived. Both
 * report the one `manifest-shape-invalid`, located by its `field` — the code says a value is not
 * the shape the format documents, whether that value is a container or a scalar.
 *
 * Form is tested and never value: a uuid is any string, a version is a string or a three-number
 * array whether or not it parses as SemVer, and a `format_version` is any number or string.
 * Absence is never a form fault — a field the source omits is the business of the completion and
 * validation rules.
 *
 * The returned `faults` name the fields a later stage must leave alone, so one fault yields one
 * problem.
 */
export function checkManifestShape(manifest: unknown): ManifestShape {
  const problems: ShapeProblem[] = []
  const faults = new Set<string>()

  const fault = (field: string, form: string): void => {
    problems.push({
      code: 'manifest-shape-invalid',
      message: `${field || 'the manifest'} is not ${form}`,
      field,
    })
    faults.add(field)
  }

  if (!isRecord(manifest)) {
    fault('', 'a JSON object')
    return { problems, faults }
  }

  if (manifest.format_version !== undefined && !isFormatVersion(manifest.format_version)) {
    fault('format_version', 'a number or a string')
  }

  const header = manifest.header
  if (header !== undefined && !isRecord(header)) {
    fault('header', 'an object')
  } else if (isRecord(header)) {
    if (header.name !== undefined && !isString(header.name)) {
      fault('header.name', 'a string')
    }
    if (header.uuid !== undefined && !isString(header.uuid)) {
      fault('header.uuid', 'a string')
    }
    if (header.version !== undefined && !isVersion(header.version)) {
      fault('header.version', 'a string or an array of three numbers')
    }
  }

  checkElements(manifest.modules, 'modules', fault, (module, at) => {
    if (module.type !== undefined && !isString(module.type)) {
      fault(`${at}.type`, 'a string')
    }
    if (module.uuid !== undefined && !isString(module.uuid)) {
      fault(`${at}.uuid`, 'a string')
    }
    if (module.version !== undefined && !isVersion(module.version)) {
      fault(`${at}.version`, 'a string or an array of three numbers')
    }
  })

  checkElements(manifest.dependencies, 'dependencies', fault, (dependency, at) => {
    // a malformed entry is settled by the discriminator, so none of its fields is form-checked
    if (classifyDependency(dependency) === 'malformed') {
      return
    }
    if (dependency.uuid !== undefined && !isString(dependency.uuid)) {
      fault(`${at}.uuid`, 'a string')
    }
    if (dependency.module_name !== undefined && !isString(dependency.module_name)) {
      fault(`${at}.module_name`, 'a string')
    }
    if (dependency.version !== undefined && !isVersion(dependency.version)) {
      fault(`${at}.version`, 'a string or an array of three numbers')
    }
  })

  return { problems, faults }
}

/** The container pass over one array field, then the form pass over each element that survived. */
function checkElements(
  value: unknown,
  field: string,
  fault: (field: string, form: string) => void,
  checkForm: (element: Record<string, unknown>, at: string) => void,
): void {
  if (value === undefined) {
    return
  }
  if (!Array.isArray(value)) {
    fault(field, 'an array')
    return
  }
  value.forEach((element, index) => {
    const at = `${field}[${String(index)}]`
    if (!isRecord(element)) {
      fault(at, 'an object')
      return
    }
    checkForm(element, at)
  })
}
