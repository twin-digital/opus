import type { OperatorTypeKey } from '@grinbox/shared'
import { Archive, Bell, CalendarClock, Filter, type LucideIcon, Sparkles, Tag } from 'lucide-react'

/**
 * Presentation + default-config metadata for each registered Operator type,
 * keyed by `type_key`. Drives the Add Operator type picker (label, description,
 * icon) and seeds a fresh editor with a valid-shaped (but empty) starting config
 * the per-type editor fills in. The set mirrors `operatorTypeKeySchema` — every
 * built-in type appears here exactly once.
 */

export interface OperatorTypeMeta {
  readonly typeKey: OperatorTypeKey
  readonly label: string
  readonly kind: 'Tagger' | 'Action'
  readonly description: string
  readonly icon: LucideIcon
}

export const OPERATOR_TYPES: readonly OperatorTypeMeta[] = [
  {
    typeKey: 'llm_tagger',
    label: 'LLM Tagger',
    kind: 'Tagger',
    description:
      'One model call produces several output Tags together. Use when classification needs judgment a fixed rule list can’t express.',
    icon: Sparkles,
  },
  {
    typeKey: 'rule_based_tagger',
    label: 'Rule-based Tagger',
    kind: 'Tagger',
    description:
      'Deterministic first-match-wins rules over Message fields and Tags, with a required fallback. Produces one output Tag. No model cost.',
    icon: Filter,
  },
  {
    typeKey: 'notify',
    label: 'Notify',
    kind: 'Action',
    description: 'Sends an out-of-band push (Pushover) using a saved Credential and a message template.',
    icon: Bell,
  },
  {
    typeKey: 'apply_category',
    label: 'Apply Category',
    kind: 'Action',
    description: 'Adds a Grinbox-owned Category to the Message on its mail backend (Gmail: a label).',
    icon: Tag,
  },
  {
    typeKey: 'archive',
    label: 'Archive',
    kind: 'Action',
    description:
      'Removes the Message from the inbox on its mail backend. The Message keeps its Categories and stays searchable — only the inbox membership changes.',
    icon: Archive,
  },
  {
    typeKey: 'digest_delivery',
    label: 'Digest delivery',
    kind: 'Action',
    description:
      'A scheduled edition that collates categorized Messages into sections (lists, tables, counts) and emails the digest.',
    icon: CalendarClock,
  },
]

export const OPERATOR_TYPE_BY_KEY: Record<OperatorTypeKey, OperatorTypeMeta> = Object.fromEntries(
  OPERATOR_TYPES.map((t) => [t.typeKey, t]),
) as Record<OperatorTypeKey, OperatorTypeMeta>

/**
 * Look up a stored operator's type by the key the API returned. That key is a
 * plain string on the wire, and a stored configuration may name a type this
 * build no longer ships, so the miss is a real case rather than an impossible
 * one — the caller renders the raw key.
 */
export function operatorTypeFor(typeKey: string): OperatorTypeMeta | undefined {
  return (OPERATOR_TYPE_BY_KEY as Partial<Record<string, OperatorTypeMeta>>)[typeKey]
}

/**
 * A fresh, empty-but-well-shaped config for a given type, used to seed the
 * editor when creating a new Operator. These are deliberately *incomplete*
 * (empty templates / enums) so the per-type Zod schema rejects them until the
 * User fills the required fields — i.e. the editor starts dirty-invalid, not
 * silently saveable. That includes the LLM Tagger's `model_id`: the picker's
 * options come from `GET /api/models` (the daemon's model map is the single
 * source of truth), so the web carries no model id of its own.
 */
export function blankConfigFor(typeKey: OperatorTypeKey): unknown {
  switch (typeKey) {
    case 'llm_tagger':
      return {
        model_id: '',
        prompt_template: '',
        outputs: [{ tag_key: '', value_enum: [''] }],
      }
    case 'rule_based_tagger':
      return {
        output_tag_key: '',
        output_value_enum: ['', ''],
        rules: [],
        fallback: { output: '' },
      }
    case 'notify':
      return { message_template: '', credentials_id: 0 }
    case 'apply_category':
      return { category_template: '' }
    case 'archive':
      // Valid as-is: an Archive with no `when` gate archives every Message.
      return {}
    case 'digest_delivery':
      return {
        schedule: '0 20 * * *',
        sections: [{ category: '', title: '', render: 'list', item_template: '' }],
        summary_model_id: null,
      }
  }
}
