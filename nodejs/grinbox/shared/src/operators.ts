import { z } from 'zod'

import { modelIdSchema } from './models.js'

/**
 * Operator `config_json` shapes, keyed by `type_key`. This is the declarative
 * half of the per-type contract: the User-editable configuration shape. The
 * behavioral half (the runtime implementation, `code_version`, and
 * `extractCredentialRefsFromOperatorConfig`) lives server-side and is NOT part
 * of this package.
 *
 * These shapes are the source of truth for what a stored configuration may
 * hold; where the fold fixes a type's behaviour but not its field shape, the
 * choice made here is noted inline.
 */

/**
 * The closed, code-resident set of Operator `type_key` values. `type_key` is
 * NOT a DB CHECK constraint — it is validated in app code — but the set of
 * built-in types is closed in grinbox's own code (d-5n8oyi8c), so it is a
 * literal union here.
 */
export const operatorTypeKeySchema = z.enum([
  'llm_tagger',
  'rule_based_tagger',
  'notify',
  'apply_category',
  'archive',
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

// --- Firing gates (`when`) ---

/**
 * The optional firing condition an Operator's `run` evaluates against the
 * current Triage's Tags before doing its work. When present, the Operator does
 * its work only if the input Tag for `tag_key` is one of `equals`; when absent
 * it always does. Available on Actions (fire the Resource effect or not) and
 * on Taggers (produce output Tags or produce none) — a gated Tagger that
 * doesn't fire emits nothing, so its declared outputs are conditionally absent
 * and downstream Operators that depend on them cascade-skip.
 *
 * `equals` is non-empty — an empty allow-set would gate the Operator off
 * entirely, which is better expressed by disabling it. Save-time validation
 * additionally requires `tag_key`'s producer to declare a value **enum**
 * (extracted outputs have unbounded values, so an equality gate over them is
 * almost certainly a mistake) and each `equals` member to be in that enum.
 */
export const actionWhenSchema = z.object({
  tag_key: tagKeySchema,
  equals: z.array(z.string().min(1)).nonempty(),
})
export type ActionWhen = z.infer<typeof actionWhenSchema>

// --- LLM Tagger ---

/**
 * The value types an *extracted* LLM Tagger output may declare. The model
 * produces the value freely; the server normalizes it after the call:
 * `string` → trimmed + length-capped; `money` → integer minor units + ISO
 * currency (`195.03 USD` → `19503:USD`); `date` → ISO 8601 date. A value that
 * fails normalization drops the Tag (absent, not an error).
 */
export const extractedValueTypeSchema = z.enum(['string', 'money', 'date'])
export type ExtractedValueType = z.infer<typeof extractedValueTypeSchema>

/**
 * A single declared output of an LLM Tagger — one of two forms:
 *  - `value_enum` — the closed-vocabulary classification output: the model
 *    must answer with exactly one of the enum's values.
 *  - `value_type` — an **extracted** output: the model produces the value
 *    freely (or reports it absent) and the server normalizes it
 *    ({@link extractedValueTypeSchema}). Extracted outputs are conditionally
 *    absent by design and are barred from `when.equals` gates and top-tags
 *    aggregation.
 */
export const llmTaggerOutputSchema = z.union([
  z.object({ tag_key: tagKeySchema, value_enum: valueEnumSchema }),
  z.object({ tag_key: tagKeySchema, value_type: extractedValueTypeSchema }),
])
export type LlmTaggerOutput = z.infer<typeof llmTaggerOutputSchema>

/**
 * LLM Tagger config. A single LLM call produces all of the Tagger's declared
 * output Tags together — this is the main reason to use an LLM Tagger over
 * multiple Rule-based Taggers (one model call, many Tags). `model_id` names one
 * of the models grinbox offers ({@link modelIdSchema}, d-kv9ipb56); `prompt_template` is the system-prompt template
 * inputs are interpolated into; `outputs` is the non-empty list of declared
 * output Tags — closed-enum classifications and/or typed extractions
 * ({@link llmTaggerOutputSchema}). The optional `when` gate restricts the
 * whole call to Triages whose `tag_key` Tag is in `equals` (see
 * {@link actionWhenSchema}) — the idiom for extraction Operators that should
 * run only for the digest categories whose templates need their fields.
 *
 * Tag keys must be unique across `outputs`: `contractFromConfig` feeds the
 * Pipeline's single-producer-per-Tag-key validation, so an LLM Tagger that
 * declared the same key twice would collide with itself.
 */
export const llmTaggerConfigSchema = z
  .object({
    model_id: modelIdSchema,
    prompt_template: z.string().min(1),
    outputs: z.array(llmTaggerOutputSchema).nonempty(),
    when: actionWhenSchema.optional(),
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
 * `match` is modeled as a free string expression rather than a structured AST
 * (d-oq267pmh); grinbox's own reader evaluates it, and a structured form could
 * replace this later without changing the Contract surface. The wildcard sentinel `"*"` is
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
 * `fallback.output` must be members of `output_value_enum`. The optional
 * `when` gate restricts the Tagger to Triages whose `tag_key` Tag is in
 * `equals` (see {@link actionWhenSchema}); a gated Tagger that doesn't fire
 * emits nothing — not even the fallback.
 */
export const ruleBasedTaggerConfigSchema = z
  .object({
    output_tag_key: tagKeySchema,
    output_value_enum: valueEnumSchema,
    rules: z.array(ruleSchema),
    fallback: fallbackSchema,
    when: actionWhenSchema.optional(),
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

// --- Archive ---

/**
 * Archive config. Removes the Message from its backend inbox (Gmail: removes
 * the `INBOX` label). The Message itself is untouched — it stays searchable
 * under "All Mail" and keeps every other label. The optional `when` gate
 * restricts firing to Triages whose `tag_key` Tag is in `equals` (see
 * {@link actionWhenSchema}). Without a gate, Archive fires for every Message
 * the Pipeline triages — so unlike Apply Category, most Archive configs
 * include a `when` gate.
 */
export const archiveConfigSchema = z.object({
  when: actionWhenSchema.optional(),
})
export type ArchiveConfig = z.infer<typeof archiveConfigSchema>

// --- Digest delivery ---

/**
 * The Tag key that slots each Message into a digest category (d-fg96l5uu). A
 * Rule-based Tagger produces
 * it as a closed enum; digest editions claim its values via their sections'
 * `category` fields. System-known so validation can tie section categories to
 * the producer's declared enum.
 */
export const DIGEST_CATEGORY_TAG_KEY = 'digest_category'

/**
 * A digest section's optional prose block (`before` / `after` the items).
 * `text` inserts the static text verbatim; `llm` makes a metered model call
 * (the edition's `summary_model_id`) given the section's rendered items and
 * inserts the resulting short prose. Prose can never add, remove, or alter
 * items — a failed LLM block is simply omitted and never fails the run.
 */
export const digestProseBlockSchema = z.union([
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
  z.object({ kind: z.literal('llm'), prompt: z.string().min(1) }),
])
export type DigestProseBlock = z.infer<typeof digestProseBlockSchema>

/** A digest table column: a header plus a per-Message cell template. */
export const digestColumnSchema = z.object({
  header: z.string().min(1),
  template: z.string().min(1),
})
export type DigestColumn = z.infer<typeof digestColumnSchema>

/**
 * Marks section items by typed comparison: an item whose `tag_key` Tag
 * compares strictly greater than `over` is highlighted. Comparison uses the
 * normalized stored forms — money as `minor:CCY` (same-currency integer
 * comparison) and dates as ISO 8601 (lexicographic) — so `over` is written in
 * the same form (e.g. `10000:USD`, `2026-08-10`). An item whose Tag is absent
 * or not comparable to `over` is simply not highlighted.
 */
export const digestHighlightSchema = z.object({
  tag_key: tagKeySchema,
  over: z.string().min(1),
})
export type DigestHighlight = z.infer<typeof digestHighlightSchema>

/**
 * One digest section: claims a `digest_category` enum value and declares how
 * its Messages render (d-hl6z38i6). Editions claim categories with their
 * sections, and no two editions of a Pipeline may claim the same one.
 *  - `render: 'list'` — each Message renders through `item_template`.
 *  - `render: 'table'` — ordered `columns`, each cell rendered independently
 *    through its own template (no delimiter conventions inside templates).
 *  - `render: 'count'` — the section reports only its Message count.
 * Templates use the standard per-Message placeholder grammar (Message fields +
 * `{{tag.*}}`); the cross-field shape rules (`item_template` iff list,
 * `columns` iff table) are enforced by the superRefine below.
 */
export const digestSectionSchema = z
  .object({
    category: z.string().min(1),
    title: z.string().min(1),
    render: z.enum(['list', 'table', 'count']),
    item_template: z.string().min(1).optional(),
    columns: z.array(digestColumnSchema).nonempty().optional(),
    highlight: digestHighlightSchema.optional(),
    before: digestProseBlockSchema.optional(),
    after: digestProseBlockSchema.optional(),
  })
  .superRefine((section, ctx) => {
    if (section.render === 'list' && section.item_template === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: "a 'list' section requires item_template",
        path: ['item_template'],
      })
    }
    if (section.render === 'table' && section.columns === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: "a 'table' section requires columns",
        path: ['columns'],
      })
    }
    if (section.render !== 'list' && section.item_template !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: "item_template applies only to 'list' sections",
        path: ['item_template'],
      })
    }
    if (section.render !== 'table' && section.columns !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: "columns apply only to 'table' sections",
        path: ['columns'],
      })
    }
  })
export type DigestSection = z.infer<typeof digestSectionSchema>

/**
 * Digest delivery config: an **edition**. `schedule` (cron; croner-validated
 * server-side) and optional IANA `timezone` are the cadence; `sections` map
 * `digest_category` values to deterministic render shapes;
 * `summary_model_id` is the model used by `llm` prose blocks — required
 * (nullable): it must be set when any section declares an `llm` block
 * (enforced here) and is `null` otherwise (the composition itself makes zero
 * model calls).
 *
 * Section `category` values must be unique within the edition (one section per
 * category); cross-edition disjointness and enum membership are Pipeline-level
 * save-time checks, not schema-local ones.
 */
export const digestDeliveryConfigSchema = z
  .object({
    schedule: z.string().min(1),
    timezone: z.string().min(1).optional(),
    sections: z.array(digestSectionSchema).nonempty(),
    summary_model_id: modelIdSchema.nullable(),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>()
    cfg.sections.forEach((section, i) => {
      if (seen.has(section.category)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate section category '${section.category}'; an edition claims each category at most once`,
          path: ['sections', i, 'category'],
        })
      }
      seen.add(section.category)
    })
    const usesLlmProse = cfg.sections.some((s) => s.before?.kind === 'llm' || s.after?.kind === 'llm')
    if (usesLlmProse && cfg.summary_model_id === null) {
      ctx.addIssue({
        code: 'custom',
        message: "summary_model_id is required when any section declares an 'llm' prose block",
        path: ['summary_model_id'],
      })
    }
  })
export type DigestDeliveryConfig = z.infer<typeof digestDeliveryConfigSchema>

/**
 * How each Operator type's runs are triggered:
 *  - `message` — one run per Triage, enqueued when a Message arrives (or is
 *    replayed) and dispatched by the execution loop.
 *  - `schedule` — time-triggered by the Daemon's digest scheduler from the
 *    type's cron `schedule` config; never enqueued into a Triage. Triage
 *    enqueue skips these types, and their Contract-declared Resource
 *    operations run outside any per-Message scope.
 */
export const OPERATOR_TYPE_TRIGGERS = {
  llm_tagger: 'message',
  rule_based_tagger: 'message',
  notify: 'message',
  apply_category: 'message',
  archive: 'message',
  digest_delivery: 'schedule',
} as const satisfies Record<OperatorTypeKey, 'message' | 'schedule'>

/** Whether `typeKey`'s runs are time-triggered rather than per-Message. */
export function isScheduledOperatorType(typeKey: OperatorTypeKey): boolean {
  return OPERATOR_TYPE_TRIGGERS[typeKey] === 'schedule'
}

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
  archive: archiveConfigSchema,
  digest_delivery: digestDeliveryConfigSchema,
} as const satisfies Record<OperatorTypeKey, z.ZodType>

/** The config type for a given `type_key`. */
export type OperatorConfigFor<K extends OperatorTypeKey> = z.infer<(typeof operatorConfigSchemas)[K]>
