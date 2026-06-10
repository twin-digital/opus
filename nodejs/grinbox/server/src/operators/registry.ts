/**
 * The server-side behavioral Operator-type registry. Each entry is the full
 * per-type tuple: `@twin-digital/grinbox-shared`'s declarative members (`configSchema`,
 * `contractFromConfig`) composed with the behavioral members (`code_version`,
 * `run`, `extractCredentialRefsFromOperatorConfig`). This is the single
 * registration site the data-model's "implementation notes" reference.
 *
 * ## Implemented vs. declared-only
 *
 * `@twin-digital/grinbox-shared` declares all five `type_key`s (their config shapes + static
 * Contracts). This registry contains only the types whose `run` is actually
 * implemented. Registering a type here is a promise that it is *runnable*:
 * `getOperatorType` returning an entry means there is a real `run`. Types that
 * are declared in shared but not yet implemented (digest_delivery) are
 * intentionally ABSENT here rather than registered with placeholder `run`s that
 * would falsely advertise them.
 *
 * As each later wave lands its `run`, it adds its `OperatorType` to
 * {@link OPERATOR_TYPES}. The `extractCredentialRefsFromOperatorConfig` hooks
 * for not-yet-implemented types live in `credential-refs.ts` (see that file)
 * so the save-time reconciler can be wired ahead of the `run`s.
 *
 * ## `code_version` convention
 *
 * Every built-in starts at the monotonic string `'1'`. When a type's runtime
 * behavior changes in a way old snapshots must NOT dispatch into, bump to `'2'`
 * (and keep the `'1'` code path while any in-flight snapshot may still carry
 * it — pipeline-runtime.md "Operator-type code version changes"). The string is
 * compared by equality, not parsed; `'1'` < `'2'` is a human convention, not a
 * code one.
 */

import type { OperatorTypeKey } from '@twin-digital/grinbox-shared'
import { applyCategoryType } from './built-ins/apply-category.js'
import { llmTaggerType } from './built-ins/llm-tagger.js'
import { notifyType } from './built-ins/notify.js'
import { ruleBasedTaggerType } from './built-ins/rule-based-tagger.js'
import type { OperatorType } from './types.js'

/**
 * The implemented Operator types, keyed by `type_key`. A `Partial` over the
 * full `OperatorTypeKey` union: only types with a real `run` appear. Each value
 * is its own `OperatorType<K>` (the key/value `type_key`s agree by
 * construction; see the registration assertions below).
 */
const OPERATOR_TYPES = {
  llm_tagger: llmTaggerType,
  rule_based_tagger: ruleBasedTaggerType,
  notify: notifyType,
  apply_category: applyCategoryType,
} satisfies Partial<{
  [K in OperatorTypeKey]: OperatorType<K>
}>

/** The `type_key`s that have a runnable implementation registered. */
export type ImplementedTypeKey = keyof typeof OPERATOR_TYPES

/**
 * Looks up the behavioral registration for a `type_key`. Returns `undefined`
 * for a declared-but-not-implemented type (or an unknown string) — callers that
 * require a runnable type use {@link resolveSnapshot}, which throws.
 */
export function getOperatorType<K extends ImplementedTypeKey>(typeKey: K): (typeof OPERATOR_TYPES)[K]
export function getOperatorType(typeKey: string): OperatorType | undefined
export function getOperatorType(typeKey: string): OperatorType | undefined {
  return (OPERATOR_TYPES as Record<string, OperatorType>)[typeKey]
}

/** All implemented Operator types, in registration order. */
export function listOperatorTypes(): OperatorType[] {
  return Object.values(OPERATOR_TYPES)
}

/** The current deployed `code_version` for an implemented type. */
export function currentCodeVersion(typeKey: ImplementedTypeKey): string {
  return OPERATOR_TYPES[typeKey].code_version
}

/** Thrown when a snapshot references an unknown type or stale code version. */
export class UnknownOperatorTypeError extends Error {
  override readonly name = 'UnknownOperatorTypeError'
}

/**
 * Resolves a snapshotted `(type_key, type_code_version)` to its behavioral
 * registration, used at the Triage-creation recheck (pipeline-runtime.md
 * "Contract validation lifecycle" → "At Triage creation"). Throws a clear
 * {@link UnknownOperatorTypeError} if the type isn't implemented or the
 * snapshotted code version doesn't match the deployed one — the caller turns
 * that into a failed Triage / failed run.
 */
export function resolveSnapshot(snapshot: { type_key: string; type_code_version: string }): OperatorType {
  const type = getOperatorType(snapshot.type_key)
  if (!type) {
    throw new UnknownOperatorTypeError(`no implemented Operator type for type_key '${snapshot.type_key}'`)
  }
  if (type.code_version !== snapshot.type_code_version) {
    throw new UnknownOperatorTypeError(
      `Operator type '${snapshot.type_key}' is deployed at code_version ` +
        `'${type.code_version}' but the snapshot carries ` +
        `'${snapshot.type_code_version}'`,
    )
  }
  return type
}
