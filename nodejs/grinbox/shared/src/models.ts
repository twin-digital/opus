import { z } from 'zod'

/**
 * The closed set of models an operator may name (d-kv9ipb56). A user picks one
 * of these and cannot introduce another; changing the set changes which stored
 * configurations are still valid, which is why the set lives here rather than
 * being inferred from whatever the model service happens to accept.
 *
 * How an identifier is actually invoked — the inference profile it resolves to,
 * and what a call costs — is the daemon's, keyed off these identifiers.
 */
export const MODEL_IDS = [
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
] as const

export type ModelId = (typeof MODEL_IDS)[number]

/**
 * Validates that a configured model identifier is one grinbox offers. An
 * operator configuration naming anything else is refused when it is saved.
 */
export const modelIdSchema = z.enum(MODEL_IDS)

const MODEL_LABELS: Readonly<Record<ModelId, string>> = {
  'anthropic.claude-haiku-4-5-20251001-v1:0': 'Claude Haiku 4.5',
  'anthropic.claude-sonnet-4-5-20250929-v1:0': 'Claude Sonnet 4.5',
}

/** One model as offered to a picker. */
export interface ModelOption {
  readonly id: ModelId
  readonly label: string
}

/** The offered models, in the order pickers show them. */
export const MODELS: readonly ModelOption[] = MODEL_IDS.map((id) => ({
  id,
  label: MODEL_LABELS[id],
}))

/** The display label for an offered model. */
export function modelLabel(id: ModelId): string {
  return MODEL_LABELS[id]
}
