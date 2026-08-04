/**
 * The package's single entry point: the operations behind the `design-process` subcommands, and
 * the types their signatures name. Everything else under `src/` is implementation and may be
 * reorganised freely.
 */

// check
export { validateTree } from './validate.js'
export type { ValidateOptions } from './validate.js'

// show
export { projectProduct } from './project.js'
export type { ProjectOptions } from './project.js'

// id
export { collectIds, generateIds } from './ids.js'
export type { IdKind } from './ids.js'

// where — fold versions and their resolution
export { formatIncrement, parseFoldVersion, resolveFold } from './version.js'
export type { FoldVersion, FoldVersionFlags, ResolvedFold } from './version.js'

// diff
export { diffFolds, renderFoldDiff } from './diff.js'
export type { AddedClaim, ClaimKind, ClosedClaim, FoldDiff } from './diff.js'

// conflicts
export { findLandingConflicts } from './conflicts.js'

// backlog
export {
  addItem,
  BACKLOG_BRANCH,
  deleteItems,
  listItems,
  readItem,
  searchItems,
  sendItems,
  updateItem,
} from './backlog.js'
export type { BacklogItem, ItemFilter, ItemPatch, NewItem, SentItem, StoreOptions } from './backlog.js'

// the tree views the operations above read from
export { DirTree, GitTree, resolveGitRef } from './tree.js'
export type { FileTree } from './tree.js'

// the shapes those operations return or fold over
export type { Fold, FoldedClaim, IncrementRef, OutOfForce } from './fold.js'
export type { DecisionEntry, Finding, ModelEntry, PresetEntry, RequirementEntry } from './types.js'
