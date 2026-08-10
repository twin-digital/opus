import { z } from 'zod'
import { extractTagRefs } from './match-expression.js'
import {
  DIGEST_CATEGORY_TAG_KEY,
  type DigestSection,
  type LlmTaggerOutput,
  type OperatorConfigFor,
  type OperatorTypeKey,
  type TagKey,
  type ValueEnum,
  extractedValueTypeSchema,
  operatorConfigSchemas,
  tagKeySchema,
  valueEnumSchema,
} from './operators.js'
import { type ResourceOperationDeclaration, resourceOperationDeclarationSchema } from './resources.js'
import { extractTemplateTagRefs } from './template-placeholder.js'

/**
 * The Contract is the declaration on each Operator: required input Tag keys,
 * declared output Tags (key + value enum), and the Resource operations it
 * invokes. The Pipeline orders execution from input/output dependencies; the
 * metered client exposes only declared operations.
 *
 * The Contract is a property of an Operator's *type + code version* (resolved
 * server-side via the code-resident registry). This package owns the
 * declarative skeleton and the parts intrinsic to each built-in type:
 *  - The resource declarations are static per `type_key` (a Notify always
 *    declares `pushover_api.send_notification`).
 *  - Inputs/outputs that are config-driven (a Tagger's output key comes from
 *    `config.output_tag_key`) are derived from config via
 *    {@link contractFromConfig}.
 */

/**
 * A declared output Tag — one of two forms, mirroring the two LLM Tagger
 * output declarations:
 *  - `valueEnum` — a closed-vocabulary output; the emitted value must be a
 *    member, and the Tag is always produced when the Operator fires.
 *  - `valueType` — an **extracted** output; the value is open (normalized
 *    server-side per its type) and the Tag is conditionally absent (a value
 *    that fails extraction or normalization is dropped). Extracted outputs
 *    cannot back `when.equals` gates and are excluded from top-tags
 *    aggregation.
 */
export const outputDeclarationSchema = z.union([
  z.object({ key: tagKeySchema, valueEnum: valueEnumSchema }),
  z.object({ key: tagKeySchema, valueType: extractedValueTypeSchema }),
])
export type OutputDeclaration = z.infer<typeof outputDeclarationSchema>

export const contractSchema = z.object({
  inputs: z.array(tagKeySchema),
  outputs: z.array(outputDeclarationSchema),
  resources: z.array(resourceOperationDeclarationSchema),
})
export type Contract = z.infer<typeof contractSchema>

/**
 * Static Resource declarations per `type_key`. These are intrinsic to the
 * built-in type and do not depend on `config_json`:
 *  - LLM Tagger / Digest: `llm_bedrock.invoke_model`.
 *  - Notify: `pushover_api.send_notification`.
 *  - Apply Category: `mailbox.apply_category`.
 *  - Archive: `mailbox.archive`.
 *  - Digest also: `mail_sender.send_message`.
 *  - Rule-based Tagger: deterministic, no Resource operations.
 *
 * Matches the Resource operations each built-in type declares (d-5n8oyi8c).
 */
export const STATIC_RESOURCES = {
  llm_tagger: [{ resource: 'llm_bedrock', operations: ['invoke_model'] }],
  rule_based_tagger: [],
  notify: [{ resource: 'pushover_api', operations: ['send_notification'] }],
  apply_category: [{ resource: 'mailbox', operations: ['apply_category'] }],
  archive: [{ resource: 'mailbox', operations: ['archive'] }],
  digest_delivery: [
    { resource: 'llm_bedrock', operations: ['invoke_model'] },
    { resource: 'mail_sender', operations: ['send_message'] },
  ],
} as const satisfies Record<OperatorTypeKey, readonly ResourceOperationDeclaration[]>

/**
 * Derives the full Contract for an Operator from its `type_key` and validated
 * `config_json`. Resources are the static per-type set; inputs and outputs are
 * derived from config where the type's outputs/inputs are config-driven.
 *
 * Built-in derivation rules:
 *  - **LLM Tagger**: N declared outputs, one per `config.outputs[]` entry —
 *    `{ key, valueEnum }` for classification outputs, `{ key, valueType }` for
 *    extracted ones. A single model call produces all of them. Its declared
 *    inputs are the distinct `{{tag.<key>}}` refs in its `prompt_template`
 *    plus the optional `when` gate's Tag.
 *  - **Rule-based Tagger**: one declared output, key + value enum taken from
 *    `config.output_tag_key` / `config.output_value_enum`. Its declared inputs
 *    are the distinct `tag.<key>` references across every Rule's `match`
 *    expression plus the optional `when` gate's Tag. A Rule whose `match` no
 *    longer parses contributes no input keys — derivation tolerates an
 *    already-invalid expression here; the save-time config validator (and
 *    run-time compile) is where invalidity is reported, not Contract
 *    derivation.
 *  - **Notify / Apply Category**: Actions; no output Tags. Their declared inputs
 *    are the Tags they read: the optional `config.when.tag_key` they gate on,
 *    plus the distinct `{{tag.<key>}}` refs in the template they render
 *    (`config.message_template` for Notify, `config.category_template` for Apply
 *    Category). Each must be produced upstream. A template that interpolates
 *    only Message fields (`{{from}}`, `{{subject}}`) contributes no inputs, and
 *    an Action with no `when` and no template Tag refs declares no inputs.
 *  - **Archive**: an Action with no output Tags and no template; its only
 *    config-driven input is the optional `when` gate's Tag.
 *  - **Digest delivery**: an Action with no output Tags. Its declared inputs
 *    are the Tags its collation reads: `digest_category` (sections slot by
 *    it), the distinct `{{tag.<key>}}` refs across every section's
 *    `item_template` / column templates, and each `highlight.tag_key`. The
 *    digest reads these from stored Triage results at digest time rather than
 *    inside a Triage, but declaring them keeps the Pipeline's dangling-input
 *    validation honest: a section template can only reference Tags some
 *    enabled Operator produces.
 *
 * The `config` argument is the *parsed* config for the type; callers should
 * have validated it through {@link operatorConfigSchemas} first.
 */
export function contractFromConfig<K extends OperatorTypeKey>(typeKey: K, config: OperatorConfigFor<K>): Contract {
  const resources: ResourceOperationDeclaration[] = STATIC_RESOURCES[typeKey].map((d) => ({
    resource: d.resource,
    operations: [...d.operations] as [string, ...string[]],
  }))

  const inputs: TagKey[] = []
  const outputs: OutputDeclaration[] = []
  const seenInputs = new Set<string>()
  const addInput = (key: string): void => {
    if (!seenInputs.has(key)) {
      seenInputs.add(key)
      inputs.push(key)
    }
  }

  switch (typeKey) {
    case 'llm_tagger': {
      // The LLM Tagger declares N outputs, one per `outputs[]` entry; a single
      // model call produces all of them together. Its Tag inputs are the
      // `{{tag.<key>}}` refs its `prompt_template` reads plus the optional
      // `when` gate's Tag.
      const c = config as {
        prompt_template: string
        outputs: readonly LlmTaggerOutput[]
        when?: { tag_key: string }
      }
      for (const o of c.outputs) {
        outputs.push(
          'value_enum' in o ? { key: o.tag_key, valueEnum: o.value_enum } : { key: o.tag_key, valueType: o.value_type },
        )
      }
      if (c.when) {
        addInput(c.when.tag_key)
      }
      for (const key of extractTemplateTagRefs(c.prompt_template)) {
        addInput(key)
      }
      break
    }
    case 'rule_based_tagger': {
      const c = config as {
        output_tag_key: string
        output_value_enum: ValueEnum
        rules: readonly { match: string }[]
        when?: { tag_key: string }
      }
      outputs.push({ key: c.output_tag_key, valueEnum: c.output_value_enum })
      if (c.when) {
        addInput(c.when.tag_key)
      }
      // A Rule depends on every `tag.<key>` its `match` reads. Tolerate a Rule
      // whose expression no longer parses — Contract derivation must not throw
      // on an already-invalid expression (the save validator / run-time compile
      // is where that is reported), so skip an unparseable Rule's refs.
      for (const rule of c.rules) {
        try {
          for (const key of extractTagRefs(rule.match)) {
            addInput(key)
          }
        } catch {
          // Unparseable `match`: contributes no input keys.
        }
      }
      break
    }
    case 'notify':
    case 'apply_category': {
      // An Action's config-driven inputs are the Tags it reads: the optional
      // `when` gate's Tag, plus every `{{tag.<key>}}` ref in the template the
      // Action renders (`message_template` for Notify, `category_template` for
      // Apply Category). Each must be produced upstream. A template that reads
      // only Message fields (`{{from}}`, `{{subject}}`) contributes no inputs.
      const c = config as {
        when?: { tag_key: string }
        message_template?: string
        category_template?: string
      }
      if (c.when) {
        addInput(c.when.tag_key)
      }
      const template = typeKey === 'notify' ? c.message_template : c.category_template
      if (template !== undefined) {
        for (const key of extractTemplateTagRefs(template)) {
          addInput(key)
        }
      }
      break
    }
    case 'archive': {
      // Archive renders no template; its only config-driven input is the
      // optional `when` gate's Tag.
      const c = config as { when?: { tag_key: string } }
      if (c.when) {
        addInput(c.when.tag_key)
      }
      break
    }
    case 'digest_delivery': {
      // The digest reads Tags from stored Triage results at digest time; its
      // inputs are the Tag keys its collation touches (see the derivation
      // rules above). Declaring them routes section-template references
      // through the Pipeline's dangling-input validation.
      const c = config as { sections: readonly DigestSection[] }
      addInput(DIGEST_CATEGORY_TAG_KEY)
      for (const section of c.sections) {
        if (section.item_template !== undefined) {
          for (const key of extractTemplateTagRefs(section.item_template)) {
            addInput(key)
          }
        }
        for (const column of section.columns ?? []) {
          for (const key of extractTemplateTagRefs(column.template)) {
            addInput(key)
          }
        }
        if (section.highlight) {
          addInput(section.highlight.tag_key)
        }
      }
      break
    }
  }

  return { inputs, outputs, resources }
}

/**
 * The declarative registry: one entry per `type_key` bundling the parts of the
 * type's contract that live in this package — its `configSchema` and its
 * `contractFromConfig`. New built-in types plug in here at a single place.
 *
 * This mirrors the server-side registry tuple
 * `(type_key, code_version, contract, configSchema,
 * extractCredentialRefsFromOperatorConfig)` but holds only the declarative
 * members; the server composes its behavioral members alongside these.
 */
export const operatorTypeRegistry = {
  llm_tagger: {
    configSchema: operatorConfigSchemas.llm_tagger,
    contractFromConfig: (c: OperatorConfigFor<'llm_tagger'>) => contractFromConfig('llm_tagger', c),
  },
  rule_based_tagger: {
    configSchema: operatorConfigSchemas.rule_based_tagger,
    contractFromConfig: (c: OperatorConfigFor<'rule_based_tagger'>) => contractFromConfig('rule_based_tagger', c),
  },
  notify: {
    configSchema: operatorConfigSchemas.notify,
    contractFromConfig: (c: OperatorConfigFor<'notify'>) => contractFromConfig('notify', c),
  },
  apply_category: {
    configSchema: operatorConfigSchemas.apply_category,
    contractFromConfig: (c: OperatorConfigFor<'apply_category'>) => contractFromConfig('apply_category', c),
  },
  archive: {
    configSchema: operatorConfigSchemas.archive,
    contractFromConfig: (c: OperatorConfigFor<'archive'>) => contractFromConfig('archive', c),
  },
  digest_delivery: {
    configSchema: operatorConfigSchemas.digest_delivery,
    contractFromConfig: (c: OperatorConfigFor<'digest_delivery'>) => contractFromConfig('digest_delivery', c),
  },
} as const satisfies Record<
  OperatorTypeKey,
  {
    configSchema: z.ZodType
    contractFromConfig: (config: never) => Contract
  }
>
