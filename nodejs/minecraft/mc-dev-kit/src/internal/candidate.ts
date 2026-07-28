import type { PackKind, Problem } from '../types.js'

/**
 * A workspace package the enumeration handed back, with its `package.json` already parsed —
 * parsing it is how the managers' libraries enumerate at all.
 */
export interface CandidatePackage {
  /** workspace-relative POSIX path; the single dot `.` for the root package */
  packageDir: string
  /** the absolute path of the package directory */
  absoluteDir: string
  /** the package's parsed `package.json`, unvalidated */
  packageJson: Record<string, unknown>
}

/**
 * A located pack as it moves through completion and validation. The `manifest` is the value the
 * source file parsed to, which completion fills in place and the entry then reports; `problems`
 * accumulates across every stage and decides the entry's status.
 */
export interface WorkingEntry {
  kind: PackKind
  packageName: string
  packageDir: string
  sourceDir: string
  outputDir: string
  /** the package the pack belongs to */
  package: CandidatePackage
  /** what the source manifest parsed to; absent when it could not be read or parsed */
  manifest?: unknown
  /**
   * dotted paths of the fields whose form the source contradicted. One fault yields one problem,
   * so every check and completion reading a named field is skipped.
   */
  formFaults: Set<string>
  problems: Problem[]
}
