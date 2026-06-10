import { z } from 'zod'

/**
 * Operator `config_json` shapes, keyed by `type_key`. This is the declarative
 * half of the per-type contract: the User-editable configuration shape. The
 * behavioral half (the runtime implementation, `code_version`, and
 * `extractCredentialRefsFromOperatorConfig`) lives server-side and is NOT part
 * of this package.
 *
 * The shapes follow the illustrative examples in data-model.md (the
 * `operators` section); this package is the source of truth the doc defers to.
 * Where the doc leaves a field shape underspecified, the choice made here is
 * noted inline.
 */

/**
 * The closed, code-resident set of Operator `type_key` values. `type_key` is
 * NOT a DB CHECK constraint (validated in app code — see data-model.md open
 * issues), but the set of built-in types is closed in code, so it's a literal
 * union here.
 */
export const operatorTypeKeySchema = z.enum([
  'llm_tagger',
  'rule_based_tagger',
  'notify',
  'apply_category',
  'digest_delivery',
])
export type OperatorTypeKey = z.infer<typeof operatorTypeKeySchema>

/**
 * A Tag key. Tags are `{key, value}` pairs; keys are non-empty identifiers.
 * Kept loose (any non-empty string) — the schema doesn't constrain key syntax.
 */
export const tagKeySchema = z.string().min(1)
export type TagKey = z.infer<typeof tagKeySchema>

/**
 * A declared output Tag's value enum: the closed set of string values the
 * producing Tagger may emit for its output key. Boolean-like Tags are 2-value
 * enums (e.g. `["yes", "no"]`). Must be non-empty and duplicate-free.
 */
export const valueEnumSchema = z
  .array(z.string().min(1))
  .nonempty()
  .superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'output value enum must not contain duplicates',
      })
    }
  })
export type ValueEnum = z.infer<typeof valueEnumSchema>

// --- LLM Tagger ---

/**
 * A single declared output of an LLM Tagger: a Tag key plus the closed set of
 * values the model may emit for it. One LLM Tagger declares one or more of
 * these in its `outputs` array.
 */
export const llmTaggerOutputSchema = z.object({
  tag_key: tagKeySchema,
  value_enum: valueEnumSchema,
})
export type LlmTaggerOutput = z.infer<typeof llmTaggerOutputSchema>

/**
 * LLM Tagger config. A single LLM call produces all of the Tagger's declared
 * output Tags together — this is the main reason to use an LLM Tagger over
 * multiple Rule-based Taggers (one model call, many Tags). `model_id` is the
 * Bedrock model identifier; `prompt_template` is the system-prompt template
 * inputs are interpolated into; `outputs` is the non-empty list of declared
 * output Tags, each with its own `value_enum`.
 *
 * Tag keys must be unique across `outputs`: `contractFromConfig` feeds the
 * Pipeline's single-producer-per-Tag-key validation, so an LLM Tagger that
 * declared the same key twice would collide with itself.
 */
export const llmTaggerConfigSchema = z
  .object({
    model_id: z.string().min(1),
    prompt_template: z.string().min(1),
    outputs: z.array(llmTaggerOutputSchema).nonempty(),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>()
    cfg.outputs.forEach((output, i) => {
      if (seen.has(output.tag_key)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate output tag_key '${output.tag_key}'; an LLM Tagger must declare each output key at most once`,
          path: ['outputs', i, 'tag_key'],
        })
      }
      seen.add(output.tag_key)
    })
  })
export type LlmTaggerConfig = z.infer<typeof llmTaggerConfigSchema>

// --- Rule-based Tagger ---

/**
 * A single Rule. `match` is an expression over the Tagger's declared input
 * Tags and any Message field; `output` is one value from the Tagger's declared
 * output enum. First match wins.
 *
 * Doc choice (underspecified by data-model.md): `match` is modeled as a free
 * string expression rather than a structured AST. The MVP Rule-based Tagger
 * evaluates these as expressions; a structured form can replace this later
 * without changing the Contract surface. The wildcard sentinel `"*"` is
 * intentionally NOT a valid `match` here — the default lives in its own
 * `fallback` field (see below), so the ordered `rules` list never carries the
 * `"*"` entry.
 */
export const ruleSchema = z.object({
  match: z
    .string()
    .min(1)
    .refine((m) => m !== '*', {
      message: 'the wildcard ("*") belongs in the `fallback` field, not the `rules` list',
    }),
  output: z.string().min(1),
})
export type Rule = z.infer<typeof ruleSchema>

/**
 * The fallback: the default output value emitted when no Rule matches.
 * Guarantees the Tagger always produces its declared output Tag, satisfying its
 * Contract regardless of the Message.
 *
 * Doc choice: the data-model example shows a separate `fallback: {...}` field.
 * This package encodes the default as a dedicated REQUIRED `fallback` field
 * (carrying just the default `output`), rather than as the required last element
 * of `rules`. This makes "the Rule list always has a default" structurally true
 * by construction — there's no way to express a `rules` list that lacks one.
 */
export const fallbackSchema = z.object({
  output: z.string().min(1),
})
export type Fallback = z.infer<typeof fallbackSchema>

/**
 * Rule-based Tagger config. Produces exactly one output Tag (`output_tag_key`,
 * values from `output_value_enum`) by evaluating the ordered `rules`
 * first-match-wins, falling back to `fallback`. Every Rule's `output` and the
 * `fallback.output` must be members of `output_value_enum`.
 */
export const ruleBasedTaggerConfigSchema = z
  .object({
    output_tag_key: tagKeySchema,
    output_value_enum: valueEnumSchema,
    rules: z.array(ruleSchema),
    fallback: fallbackSchema,
  })
  .superRefine((cfg, ctx) => {
    const allowed = new Set(cfg.output_value_enum)
    cfg.rules.forEach((rule, i) => {
      if (!allowed.has(rule.output)) {
        ctx.addIssue({
          code: 'custom',
          message: `rule output '${rule.output}' is not in output_value_enum`,
          path: ['rules', i, 'output'],
        })
      }
    })
    if (!allowed.has(cfg.fallback.output)) {
      ctx.addIssue({
        code: 'custom',
        message: `fallback output '${cfg.fallback.output}' is not in output_value_enum`,
        path: ['fallback', 'output'],
      })
    }
  })
export type RuleBasedTaggerConfig = z.infer<typeof ruleBasedTaggerConfigSchema>

// --- Action value-gating (`when`) ---

/**
 * The optional firing condition an Action's `run` evaluates against the current
 * Triage's Tags before performing its Resource effect. When present, the Action
 * fires only if the input Tag for `tag_key` is one of `equals`; when absent the
 * Action always fires (backward-compatible — Actions are always *eligible* per
 * their Contract, so this is a purely operator-level gate, not a Pipeline input
 * declaration).
 *
 * Rationale: an always-firing Notify pings on every Message; `when` narrows it
 * (e.g. `{ tag_key: 'urgency', equals: ['high'] }`). `equals` is non-empty —
 * an empty allow-set would gate the Action off entirely, which is better
 * expressed by disabling the Operator.
 */
export const actionWhenSchema = z.object({
  tag_key: tagKeySchema,
  equals: z.array(z.string().min(1)).nonempty(),
})
export type ActionWhen = z.infer<typeof actionWhenSchema>

// --- Notify ---

/**
 * Notify config. Sends an out-of-band push (Pushover today). `credentials_id`
 * references a user-scoped `pushover` Credential — the server extracts this for
 * `operator_credential_references`. The optional `when` gate restricts firing to
 * Triages whose `tag_key` Tag is in `equals` (see {@link actionWhenSchema}).
 */
export const notifyConfigSchema = z.object({
  message_template: z.string().min(1),
  credentials_id: z.number().int().positive(),
  when: actionWhenSchema.optional(),
})
export type NotifyConfig = z.infer<typeof notifyConfigSchema>

// --- Apply Category ---

/**
 * Apply Category config. Adds a Grinbox-owned Category to the Message on its
 * backend; `category_template` is the (possibly templated) Category name. The
 * optional `when` gate restricts firing to Triages whose `tag_key` Tag is in
 * `equals` (see {@link actionWhenSchema}); Apply Category typically categorizes
 * every Message, so it is usually absent.
 */
export const applyCategoryConfigSchema = z.object({
  category_template: z.string().min(1),
  when: actionWhenSchema.optional(),
})
export type ApplyCategoryConfig = z.infer<typeof applyCategoryConfigSchema>

// --- Digest delivery ---

/**
 * Digest delivery config. The daily Action that summarizes qualifying Messages
 * via the summarization model and emails the digest to the user.
 *
 * Doc choice (underspecified by data-model.md): `schedule` is modeled as a cron
 * expression string. The Daemon's scheduler is `croner` (architecture.md tech
 * stack), which consumes cron strings, so this matches the runtime. `model_id`
 * is the (typically more capable) summarization model.
 */
export const digestDeliveryConfigSchema = z.object({
  schedule: z.string().min(1),
  model_id: z.string().min(1),
  prompt_template: z.string().min(1),
})
export type DigestDeliveryConfig = z.infer<typeof digestDeliveryConfigSchema>

/**
 * Discriminated map from `type_key` to its `config_json` Zod schema. Used by
 * the registry; the server's per-type behavioral tuple aligns its
 * `configSchema` member to these.
 */
export const operatorConfigSchemas = {
  llm_tagger: llmTaggerConfigSchema,
  rule_based_tagger: ruleBasedTaggerConfigSchema,
  notify: notifyConfigSchema,
  apply_category: applyCategoryConfigSchema,
  digest_delivery: digestDeliveryConfigSchema,
} as const satisfies Record<OperatorTypeKey, z.ZodType>

/** The config type for a given `type_key`. */
export type OperatorConfigFor<K extends OperatorTypeKey> = z.infer<(typeof operatorConfigSchemas)[K]>
