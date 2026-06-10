import type { OperatorTypeKey } from '@twin-digital/grinbox-shared'
import { Bell, CalendarClock, Filter, type LucideIcon, Sparkles, Tag } from 'lucide-react'

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
    description: 'Adds a Grinbox-owned Category (label) to the Message on its mail backend.',
    icon: Tag,
  },
  {
    typeKey: 'digest_delivery',
    label: 'Digest delivery',
    kind: 'Action',
    description: 'A scheduled daily Action that summarizes qualifying Messages with a model and emails the digest.',
    icon: CalendarClock,
  },
]

export const OPERATOR_TYPE_BY_KEY: Record<OperatorTypeKey, OperatorTypeMeta> = Object.fromEntries(
  OPERATOR_TYPES.map((t) => [t.typeKey, t]),
) as Record<OperatorTypeKey, OperatorTypeMeta>

/** The default fast/cheap Bedrock model — seeds the LLM Tagger. */
const DEFAULT_TAGGER_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0'
/** The default more-capable model — seeds Digest delivery summarization. */
const DEFAULT_SUMMARY_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0'

/**
 * The Bedrock models offered in the model pickers. These ids must be a subset
 * of the daemon's supported set — the single source of truth is the server's
 * `MODEL_INFERENCE_PROFILES` map (packages/server/src/resources/bedrock.ts). A
 * model id offered here that the daemon can't map raises `UnmappedModelError`
 * when the Operator runs, so the two lists must agree.
 *
 * TODO: source this from a `GET /api/models` endpoint instead of hardcoding, so
 * the available models track the daemon's configuration rather than this list
 * (which would also remove this duplication).
 */
export const MODEL_OPTIONS: readonly { id: string; label: string }[] = [
  { id: DEFAULT_TAGGER_MODEL, label: 'Claude Haiku 4.5' },
  { id: DEFAULT_SUMMARY_MODEL, label: 'Claude Sonnet 4.5' },
]

/**
 * A fresh, empty-but-well-shaped config for a given type, used to seed the
 * editor when creating a new Operator. These are deliberately *incomplete*
 * (empty templates / enums) so the per-type Zod schema rejects them until the
 * User fills the required fields — i.e. the editor starts dirty-invalid, not
 * silently saveable.
 */
export function blankConfigFor(typeKey: OperatorTypeKey): unknown {
  switch (typeKey) {
    case 'llm_tagger':
      return {
        model_id: DEFAULT_TAGGER_MODEL,
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
    case 'digest_delivery':
      return {
        schedule: '0 8 * * *',
        model_id: DEFAULT_SUMMARY_MODEL,
        prompt_template: '',
      }
  }
}
