import type { FeatureScope } from '../config/repo-kit-configuration.js'

/**
 * Describes the project a feature is being considered against.
 */
export interface ProjectKind {
  /**
   * Whether the project is the workspace root (the repo meta-package) rather than a member package.
   */
  isRoot: boolean
}

/**
 * Resolves a {@link FeatureScope} name to a predicate over projects, then evaluates it against `project`.
 *
 * This is the single place scope names are interpreted. The built-in names (`packages`/`root`/`all`) are, in effect,
 * a small hard-coded registry of selectors; widening to user-defined named selectors is intended to happen here
 * without changing the meaning of the existing names.
 *
 * @param scope The scope name from a feature; defaults to `packages` when omitted.
 * @param project The project under consideration.
 * @returns Whether a feature with this scope applies to the project.
 */
export const resolveScope = (scope: FeatureScope | undefined, project: ProjectKind): boolean => {
  switch (scope ?? 'packages') {
    case 'all':
      return true
    case 'root':
      return project.isRoot
    case 'packages':
      return !project.isRoot
  }
}
