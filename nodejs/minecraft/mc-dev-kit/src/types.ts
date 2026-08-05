/**
 * The kind of pack an entry describes. The kind comes from the source directory the pack was
 * found in — `behavior_pack` or `resource_pack` — and the manifest corroborates it.
 */
export type PackKind = 'behavior' | 'resource'

/**
 * A version as a source manifest may write it: a `[major, minor, revision]` vector, or a SemVer
 * string. Both forms are accepted at every manifest format version except 3, which requires the
 * string.
 */
export type ManifestVersion = string | [number, number, number]

/**
 * A pack manifest module. `type` states what the module holds; `data` and `script` corroborate a
 * behavior pack and `resources` a resource pack, and any other type is ignored.
 *
 * `entry` is the kit's to write: a source manifest specifying one is `module-entry-specified`, and
 * a completed script module carries the pack-relative path of its built bundle.
 */
export interface ManifestModule {
  type: string
  uuid?: string
  version?: ManifestVersion
  /** the built script's path relative to the pack root, written by completion */
  entry?: string
  [key: string]: unknown
}

/** A dependency on another pack, named by the exact header uuid that pack declares. */
export interface ManifestPackDependency {
  uuid: string
  version: ManifestVersion
  [key: string]: unknown
}

/** A dependency on a built-in scripting module, such as `@minecraft/server`. */
export interface ManifestModuleDependency {
  module_name: string
  version: ManifestVersion
  [key: string]: unknown
}

/** An entry of a manifest's `dependencies` array, naming either a pack or a scripting module. */
export type ManifestDependency = ManifestPackDependency | ManifestModuleDependency

/** The identity and version of the pack a manifest defines. */
export interface ManifestHeader {
  name: string
  uuid: string
  version: string
  [key: string]: unknown
}

/**
 * The completed manifest a valid entry carries.
 *
 * This states what such an entry guarantees rather than what a source file may hold: a field
 * validation demands, or completion always writes, is required. It is typed over what the kit
 * reads and completes and no further, so each interface carries an index signature and keys the
 * kit does not model reach the consumer unchanged.
 */
export interface PackManifest {
  format_version?: number | string
  header: ManifestHeader
  modules: [ManifestModule, ...ManifestModule[]]
  dependencies?: ManifestDependency[]
  [key: string]: unknown
}

/**
 * A fault the kit met while reading, completing, or validating a pack. Any problem makes its
 * entry invalid.
 *
 * The set is closed: every fault the kit reports carries one of these codes, so a consumer's
 * switch over them is exhaustive, and a fault class the kit later learns to report arrives as a
 * new code in a new version.
 *
 * `field` locates the problem in the source manifest as a dotted path with bracketed array
 * indices (`header.version`, `dependencies[2].version`); the manifest root itself is the empty
 * string. `packageDir` names the package whose `package.json` is at fault.
 */
export type Problem =
  | { code: 'manifest-unreadable'; message: string; error: string }
  | { code: 'manifest-shape-invalid'; message: string; field: string }
  | { code: 'array-version-at-format-version-3'; message: string; field: string }
  | { code: 'header-name-specified'; message: string }
  | { code: 'header-version-specified'; message: string }
  | { code: 'module-entry-specified'; message: string; field: string }
  | { code: 'package-name-missing'; message: string }
  | { code: 'package-version-missing'; message: string; field: string; packageDir: string }
  | {
      code: 'package-version-invalid'
      message: string
      field: string
      packageDir: string
      value: string
    }
  | { code: 'dependency-version-specified'; message: string; field: string; uuid: string }
  | { code: 'dependency-entry-malformed'; message: string; field: string }
  | {
      code: 'external-dependency-version-missing'
      message: string
      field: string
      moduleName: string
    }
  | { code: 'dependency-unsatisfied'; message: string; field: string; uuid: string }
  | { code: 'manifest-missing-uuid'; message: string }
  | { code: 'module-missing-type'; message: string; field: string }
  | { code: 'kind-not-corroborated'; message: string }
  | { code: 'foreign-kind-module'; message: string; field: string; type: string }
  | { code: 'duplicate-uuid'; message: string; uuid: string; claimants: string[] }
  | { code: 'dependency-invalid'; message: string; field: string; uuid: string }

/**
 * The details every entry carries, whatever its status. Each path is a normalised POSIX path
 * relative to the workspace root, with no `./` prefix and no trailing slash; the root package's
 * `packageDir` is the single dot `.`.
 */
export interface PackEntryBase {
  /** from the source directory name, corroborated by the manifest */
  kind: PackKind
  /** the owning package's name, or its directory basename when it has none */
  packageName: string
  /** workspace-relative, e.g. `packages/mc-pack-1` */
  packageDir: string
  /** workspace-relative, e.g. `packages/mc-pack-1/behavior_pack` */
  sourceDir: string
  /** workspace-relative, e.g. `packages/mc-pack-1/dist/behavior_pack`, reported whether or not it exists */
  outputDir: string
  /**
   * where a behavior pack's bundled script module belongs — `scripts/main.js` within `outputDir` —
   * reported whether or not it exists, and `null` for a resource pack, which has no script. The
   * location is computed from the pack's kind; nothing is probed and no source `entry` is read.
   */
  scriptOutput: string | null
}

/** A pack the kit resolved whole: every detail is present and nothing is in doubt. */
export interface ValidPackEntry extends PackEntryBase {
  status: 'valid'
  /** the completed manifest's `header.uuid`, lowercased */
  uuid: string
  /** the completed manifest's `header.version`, a SemVer string */
  version: string
  /** the completed manifest, in the format version it declared */
  manifest: PackManifest
  problems: []
}

/**
 * A pack the kit found but could not resolve. It carries the problems that invalidated it plus
 * every detail its sources still hold: `uuid`, `version`, and `manifest` are the manifest-derived
 * details a fault can take away, and the rest are present on every entry.
 */
export interface InvalidPackEntry extends PackEntryBase {
  status: 'invalid'
  uuid?: string
  version?: string
  /** whatever the source manifest parsed to, completed as far as it could be */
  manifest?: unknown
  problems: [Problem, ...Problem[]]
}

/** One pack found in the workspace, marked valid or invalid. */
export type PackEntry = ValidPackEntry | InvalidPackEntry

/**
 * Criteria narrowing the entries a call returns. Every criterion matches exactly — no substring,
 * no case folding — except `uuid`, which is compared with both sides lowercased. Where more than
 * one is given an entry must satisfy all of them, and a criterion whose value an entry does not
 * carry never matches.
 */
export interface PackCriteria {
  /** the owning package's name, e.g. `@scope/mc-pack-1` */
  package?: string
  /** the completed manifest's `header.name` */
  name?: string
  /** the header uuid */
  uuid?: string
  status?: 'valid' | 'invalid'
}

/** The workspace root an ascent found, and the package sitting at it. */
export interface WorkspaceRoot {
  /** the absolute path of the workspace root directory */
  root: string
  /** the root package's declared name, or its directory basename where it declares none */
  packageName: string
}

/** Options for {@link resolveWorkspaceRoot}. */
export interface WorkspaceRootOptions {
  /** where the ascent starts; defaults to `process.cwd()`, and a relative path resolves against it */
  from?: string
}

/** Options for {@link discoverPacks}. */
export interface DiscoverOptions {
  /** the workspace root; defaults to `process.cwd()`, and a relative path resolves against it */
  workspace?: string
  /** when given, only the entries matching it are returned */
  filter?: PackCriteria
}
