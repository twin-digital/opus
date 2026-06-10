/**
 * The operator-level firing gate shared by the Action built-ins (Notify, Apply
 * Category). Actions declare no input Tags in their Contract, so the Pipeline
 * always treats them as *eligible*; the optional `when` clause in their config
 * is the runtime condition that decides whether the Action actually fires
 * (architecture.md "Operator model" → Actions). When `when` is absent the
 * Action always fires (backward-compatible); when present it fires only if the
 * current Triage's Tag for `when.tag_key` is one of `when.equals`.
 */

import type { ActionWhen } from '@twin-digital/grinbox-shared'

/**
 * Evaluates an Action's optional `when` gate against the current Triage's input
 * Tags. Returns `true` (fire) when `when` is absent, or when the Tag for
 * `when.tag_key` is present and its value is in `when.equals`; returns `false`
 * (clean no-op) otherwise — including when the gated Tag was never produced.
 */
export function shouldFire(when: ActionWhen | undefined, tags: ReadonlyMap<string, string>): boolean {
  if (!when) {
    return true
  }
  const value = tags.get(when.tag_key)
  if (value === undefined) {
    return false
  }
  return when.equals.includes(value)
}
