/**
 * The server-side behavioral Operator-type registry. Each entry is the full
 * per-type tuple: `@grinbox/shared`'s declarative members (`configSchema`,
 * `contractFromConfig`) composed with the behavioral members (`code_version`,
 * `run`, `extractCredentialRefsFromOperatorConfig`). It is the one registration
 * site for the closed set of Operator types (d-5n8oyi8c).
 *
 * ## What registration means
 *
 * Every declared `type_key` is registered with its full behavioral tuple.
 * Registering a type is a promise that it is *executable* under its trigger
 * model (shared's `OPERATOR_TYPE_TRIGGERS`): message-triggered types run
 * per-Triage via `run`; the schedule-triggered `digest_delivery` runs via the
 * digest scheduler (`digest/`), and its per-Message `run` throws — Triage
 * enqueue never creates run rows for it. The
 * `extractCredentialRefsFromOperatorConfig` hooks also live standalone in
 * `credential-refs.ts`, keyed over the full type union, for the save-time
 * reconciler.
 *
 * ## `code_version` convention
 *
 * Every built-in starts at the monotonic string `'1'`. When a type's runtime
 * behavior changes in a way old snapshots must NOT dispatch into, bump to `'2'`
 * (and keep the `'1'` code path while any in-flight snapshot may still carry
 * it — d-nr71oscu). The string is
 * compared by equality, not parsed; `'1'` < `'2'` is a human convention, not a
 * code one.
 */

import type { OperatorTypeKey } from '@grinbox/shared'
import { applyCategoryType } from './built-ins/apply-category.js'
import { archiveType } from './built-ins/archive.js'
import { digestDeliveryType } from './built-ins/digest-delivery.js'
import { fileType } from './built-ins/file.js'
import { llmTaggerType } from './built-ins/llm-tagger.js'
import { notifyType } from './built-ins/notify.js'
import { ruleBasedTaggerType } from './built-ins/rule-based-tagger.js'
import { setAsideType } from './built-ins/set-aside.js'
import type { OperatorType } from './types.js'

/**
 * The implemented Operator types, keyed by `type_key`. A `Partial` over the
 * full `OperatorTypeKey` union (every declared type is currently present).
 * Each value is its own `OperatorType<K>` (the key/value `type_key`s agree by
 * construction; see the registration assertions below).
 */
const OPERATOR_TYPES = {
  llm_tagger: llmTaggerType,
  rule_based_tagger: ruleBasedTaggerType,
  notify: notifyType,
  apply_category: applyCategoryType,
  archive: archiveType,
  file: fileType,
  set_aside: setAsideType,
  digest_delivery: digestDeliveryType,
} satisfies Partial<{
  [K in OperatorTypeKey]: OperatorType<K>
}>

/** The `type_key`s that have a runnable implementation registered. */
export type ImplementedTypeKey = keyof typeof OPERATOR_TYPES

/**
 * Looks up the behavioral registration for a `type_key`. Returns `undefined`
 * for an unknown string — callers that require a registered type use
 * {@link resolveSnapshot}, which throws.
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
 * registration, used at the Triage-creation recheck (d-8y8i45y2). Throws a
 * clear
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
