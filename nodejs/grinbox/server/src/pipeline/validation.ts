/**
 * Save-time Pipeline validation (d-8y8i45y2, r-qu9y7wgg). Pure function over
 * the post-change set of a Pipeline's *enabled* Operators — no DB access — so it
 * is trivially testable and reusable by both the Operator-save write pattern and
 * the lightweight Triage-creation recheck.
 *
 * ## Why shared's declarative registry, not the server's behavioral one
 *
 * Validation covers every declared Operator type through `@grinbox/shared`'s
 * declarative `operatorTypeRegistry` / `operatorConfigSchemas` /
 * `contractFromConfig` — the structural half of each type's contract, which is
 * all validation needs. The server's behavioral registry
 * (`operators/registry.ts`) stays out of this layer: its `resolveSnapshot` is
 * the runtime dispatch/runnability seam (execution loop), not a validation
 * dependency, and keeping validation declarative-only means it stays a pure
 * function usable at both save time and the Triage-creation recheck.
 */

import {
  type Contract,
  DIGEST_CATEGORY_TAG_KEY,
  type OperatorConfigFor,
  type OperatorTypeKey,
  type OutputDeclaration,
  TEMPLATE_MESSAGE_FIELDS,
  contractFromConfig,
  extractReservedCallPlaceholders,
  extractUnknownTemplatePlaceholders,
  operatorConfigSchemas,
  operatorTypeRegistry,
  resourceOperationDeclarationSchema,
} from '@grinbox/shared'

/** One Operator as the validator sees it: identity + type + raw config JSON. */
export interface OperatorForValidation {
  readonly operator_id: number
  readonly type_key: string
  readonly config_json: string
}

/** A single validation failure, tagged by kind for structured handling/tests. */
export type ValidationError =
  | {
      readonly kind: 'unknown_type'
      readonly operatorId: number
      readonly typeKey: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_config'
      readonly operatorId: number
      readonly typeKey: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_resource_declaration'
      readonly operatorId: number
      readonly message: string
    }
  | {
      readonly kind: 'output_key_collision'
      readonly key: string
      readonly operatorIds: readonly number[]
      readonly message: string
    }
  | {
      readonly kind: 'dangling_input'
      readonly operatorId: number
      readonly inputKey: string
      readonly message: string
    }
  | {
      readonly kind: 'cycle'
      readonly cycle: readonly number[]
      readonly message: string
    }
  | {
      readonly kind: 'unknown_placeholder'
      readonly operatorId: number
      readonly placeholder: string
      readonly message: string
    }
  | {
      readonly kind: 'reserved_placeholder'
      readonly operatorId: number
      readonly placeholder: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_when_gate'
      readonly operatorId: number
      readonly tagKey: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_digest_section'
      readonly operatorId: number
      readonly category: string | null
      readonly message: string
    }

export type ValidationResult =
  | { readonly ok: true; readonly contracts: ReadonlyMap<number, Contract> }
  | { readonly ok: false; readonly errors: readonly ValidationError[] }

function isKnownType(typeKey: string): typeKey is OperatorTypeKey {
  return Object.hasOwn(operatorTypeRegistry, typeKey)
}

/**
 * Validates the post-change set of enabled Operators for a Pipeline. The set is
 * the *result* of applying the proposed create/edit/enable/disable/delete —
 * callers compute the post-state and hand it here.
 *
 * Checks, in order (per-Operator structural checks first, then graph-level):
 *  1. `type_key` is a known declared type.
 *  2. `config_json` parses against the type's `operatorConfigSchemas` entry.
 *  3. Each Contract's Resource/operation declarations are valid.
 *  4. Output Tag-key single-producer: no two enabled Operators declare the same
 *     output key.
 *  5. Dangling input: every declared input key is produced by some enabled
 *     Operator in the set.
 *  6. Acyclicity: the input→output dependency DAG has no cycle (the cycle is
 *     reported when one is found).
 *
 * All per-Operator and collision/dangling errors are collected; the result is
 * `ok` only when there are none. Returns the derived Contracts on success so
 * callers don't re-derive them.
 */
export function validatePipeline(operators: readonly OperatorForValidation[]): ValidationResult {
  const errors: ValidationError[] = []
  const contracts = new Map<number, Contract>()

  // 1–3: per-Operator type + config + resource-declaration checks.
  for (const op of operators) {
    if (!isKnownType(op.type_key)) {
      errors.push({
        kind: 'unknown_type',
        operatorId: op.operator_id,
        typeKey: op.type_key,
        message: `Operator ${op.operator_id} has unknown type_key '${op.type_key}'`,
      })
      continue
    }
    const typeKey = op.type_key
    const parsed = operatorConfigSchemas[typeKey].safeParse(safeJsonParse(op.config_json))
    if (!parsed.success) {
      errors.push({
        kind: 'invalid_config',
        operatorId: op.operator_id,
        typeKey,
        message: `Operator ${op.operator_id} config invalid for '${typeKey}': ${parsed.error.message}`,
      })
      continue
    }

    // `parsed.data` is the validated config for `typeKey`.
    const contract = deriveContract(typeKey, parsed.data)

    // 3: re-validate the derived Resource declarations against shared's schema.
    // The static declarations are correct by construction, but a future
    // config-driven Resource set would surface a bad declaration here.
    let resourceOk = true
    for (const decl of contract.resources) {
      const declCheck = resourceOperationDeclarationSchema.safeParse(decl)
      if (!declCheck.success) {
        resourceOk = false
        errors.push({
          kind: 'invalid_resource_declaration',
          operatorId: op.operator_id,
          message: `Operator ${op.operator_id} declares an invalid Resource operation: ${declCheck.error.message}`,
        })
      }
    }
    if (resourceOk) {
      contracts.set(op.operator_id, contract)
    }
  }

  // If any Operator failed to produce a Contract, the graph is incomplete;
  // report the structural errors without attempting graph-level checks (they'd
  // produce confusing secondary errors against a partial graph).
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // 4–6: graph-level checks over the derived Contracts.
  const graphErrors = validateContractGraph(contracts)
  if (graphErrors.length > 0) {
    return { ok: false, errors: graphErrors }
  }
  return { ok: true, contracts }
}

/**
 * The graph-level half of validation, over already-derived Contracts keyed by
 * `operator_id`. Separated from {@link validatePipeline} so the single-producer,
 * dangling-input, and cycle checks are directly testable with synthetic
 * Contracts independent of how any specific built-in derives its inputs.
 *
 *  4. Output Tag-key single-producer: no two Operators declare the same output.
 *  5. Dangling input: every declared input key is produced by some Operator.
 *  6. Acyclicity: the producer→consumer dependency DAG has no cycle (reported).
 *
 * The cycle check runs only when outputs are uniquely produced and inputs are
 * satisfiable; running it over a graph with a collision/dangling edge would
 * report a confusing secondary error.
 */
export function validateContractGraph(contracts: ReadonlyMap<number, Contract>): ValidationError[] {
  const errors: ValidationError[] = []

  const producers = new Map<string, number[]>()
  for (const [operatorId, contract] of contracts) {
    for (const out of contract.outputs) {
      const list = producers.get(out.key)
      if (list) {
        list.push(operatorId)
      } else {
        producers.set(out.key, [operatorId])
      }
    }
  }
  for (const [key, operatorIds] of producers) {
    if (operatorIds.length > 1) {
      errors.push({
        kind: 'output_key_collision',
        key,
        operatorIds,
        message: `Tag key '${key}' is produced by more than one enabled Operator (${operatorIds.join(', ')})`,
      })
    }
  }

  for (const [operatorId, contract] of contracts) {
    for (const inputKey of contract.inputs) {
      if (!producers.has(inputKey)) {
        errors.push({
          kind: 'dangling_input',
          operatorId,
          inputKey,
          message: `Operator ${operatorId} requires input Tag '${inputKey}' which no enabled Operator produces`,
        })
      }
    }
  }

  if (errors.length === 0) {
    const cycle = findCycle(contracts, producers)
    if (cycle) {
      errors.push({
        kind: 'cycle',
        cycle,
        message: `Operator dependency cycle: ${cycle.join(' -> ')}`,
      })
    }
  }

  return errors
}

/**
 * The templates an Operator's config renders through the per-Message
 * placeholder engine, as `(label, text)` pairs — one entry for the single-field
 * types, one per section template (item template / each column independently)
 * for a digest edition. Labels name the field in error messages.
 */
function templatesOf(typeKey: OperatorTypeKey, config: Record<string, unknown>): { label: string; template: string }[] {
  const single = (field: string): { label: string; template: string }[] => {
    const template = config[field]
    return typeof template === 'string' ? [{ label: field, template }] : []
  }
  switch (typeKey) {
    case 'llm_tagger':
      return single('prompt_template')
    case 'notify':
      return single('message_template')
    case 'apply_category':
      return single('category_template')
    case 'digest_delivery': {
      const c = config as unknown as OperatorConfigFor<'digest_delivery'>
      const out: { label: string; template: string }[] = []
      c.sections.forEach((section, i) => {
        if (section.item_template !== undefined) {
          out.push({
            label: `sections[${i}].item_template`,
            template: section.item_template,
          })
        }
        section.columns?.forEach((column, j) => {
          out.push({
            label: `sections[${i}].columns[${j}].template`,
            template: column.template,
          })
        })
      })
      return out
    }
    case 'rule_based_tagger':
    case 'archive':
      return []
  }
}

/**
 * Placeholder-name errors for every template an Operator renders:
 *  - `unknown_placeholder` — a name the renderer would silently resolve to the
 *    empty string (a misspelling like `{{Body}}` is almost certainly a
 *    mistake, not an intentional empty string).
 *  - `reserved_placeholder` — the `name(...)` call form, reserved in the
 *    grammar for future set-level aggregation; rejected with a dedicated
 *    message so the author learns why
 *    `{{sum(tag.amount)}}` doesn't work yet rather than seeing a generic
 *    unknown-name error.
 */
function templatePlaceholderErrors(
  op: OperatorForValidation,
  typeKey: OperatorTypeKey,
  config: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = []
  for (const { label, template } of templatesOf(typeKey, config)) {
    for (const placeholder of extractReservedCallPlaceholders(template)) {
      errors.push({
        kind: 'reserved_placeholder',
        operatorId: op.operator_id,
        placeholder,
        message: `Operator ${op.operator_id} ${label} uses '{{${placeholder}}}': the 'name(...)' placeholder form is reserved for aggregation and is not available yet`,
      })
    }
    for (const placeholder of extractUnknownTemplatePlaceholders(template)) {
      errors.push({
        kind: 'unknown_placeholder',
        operatorId: op.operator_id,
        placeholder,
        message:
          `Operator ${op.operator_id} ${label} references unknown placeholder ` +
          `'{{${placeholder}}}' (known: ${TEMPLATE_MESSAGE_FIELDS.join(', ')}, tag.<key>)`,
      })
    }
  }
  return errors
}

/** The declared output for `key` across the post-state set, if any. */
function findProducerOutput(postState: readonly ParsedOperator[], key: string): OutputDeclaration | null {
  for (const other of postState) {
    for (const out of other.contract.outputs) {
      if (out.key === key) {
        return out
      }
    }
  }
  return null
}

/**
 * `when`-gate errors for an Operator: the gate's `tag_key` must be produced as
 * a closed **enum** output (an equality gate over an extracted output's
 * unbounded values is almost certainly a mistake — d-2asvd71w), and every
 * `equals` member must be in that enum (a value the
 * producer can never emit would gate the Operator off silently). A missing
 * producer is not reported here — the gate's `tag_key` is a Contract input, so
 * {@link validatePipeline}'s dangling-input check owns that case.
 */
function whenGateErrors(
  op: OperatorForValidation,
  config: Record<string, unknown>,
  postState: readonly ParsedOperator[],
): ValidationError[] {
  const when = config.when as { tag_key: string; equals: string[] } | undefined
  if (!when) {
    return []
  }
  const producer = findProducerOutput(postState, when.tag_key)
  if (!producer) {
    return []
  }
  if (!('valueEnum' in producer)) {
    return [
      {
        kind: 'invalid_when_gate',
        operatorId: op.operator_id,
        tagKey: when.tag_key,
        message: `Operator ${op.operator_id} gates on '${when.tag_key}', which is an extracted output; \`when.equals\` gates require an enum-contracted producer`,
      },
    ]
  }
  const allowed = new Set(producer.valueEnum)
  return when.equals
    .filter((v) => !allowed.has(v))
    .map((value) => ({
      kind: 'invalid_when_gate' as const,
      operatorId: op.operator_id,
      tagKey: when.tag_key,
      message:
        `Operator ${op.operator_id} gates on '${when.tag_key}' = '${value}', ` +
        `which is not in the producer's enum [${producer.valueEnum.join(', ')}]`,
    }))
}

/**
 * Digest-edition errors (d-fg96l5uu, d-nfsr4h6f):
 *  - every section `category` must be a member of the `digest_category`
 *    producer's declared enum (and that producer must be enum-contracted);
 *  - the edition's categories must be disjoint from every other enabled
 *    edition's in the Pipeline (with disjoint coverage windows, this is what
 *    keeps a Message out of two digests);
 *  - a `highlight.tag_key` must be produced as an extracted `money` or `date`
 *    output — the two types with a defined ordering.
 * A missing `digest_category` producer is the dangling-input check's case.
 */
function digestSectionErrors(
  op: OperatorForValidation,
  config: Record<string, unknown>,
  postState: readonly ParsedOperator[],
): ValidationError[] {
  const errors: ValidationError[] = []
  const c = config as unknown as OperatorConfigFor<'digest_delivery'>

  const categoryProducer = findProducerOutput(postState, DIGEST_CATEGORY_TAG_KEY)
  if (categoryProducer && !('valueEnum' in categoryProducer)) {
    errors.push({
      kind: 'invalid_digest_section',
      operatorId: op.operator_id,
      category: null,
      message: `Operator ${op.operator_id}: the '${DIGEST_CATEGORY_TAG_KEY}' producer must declare a closed enum for sections to claim its values`,
    })
  }
  const declaredCategories =
    categoryProducer && 'valueEnum' in categoryProducer ? new Set(categoryProducer.valueEnum) : null

  const claimedElsewhere = new Map<string, number>()
  for (const other of postState) {
    if (other.operator_id === op.operator_id) {
      continue
    }
    if (other.type_key !== 'digest_delivery') {
      continue
    }
    const otherConfig = other.config as OperatorConfigFor<'digest_delivery'>
    for (const section of otherConfig.sections) {
      claimedElsewhere.set(section.category, other.operator_id)
    }
  }

  for (const section of c.sections) {
    if (declaredCategories && !declaredCategories.has(section.category)) {
      errors.push({
        kind: 'invalid_digest_section',
        operatorId: op.operator_id,
        category: section.category,
        message:
          `Operator ${op.operator_id} section '${section.category}' is not in ` +
          `the '${DIGEST_CATEGORY_TAG_KEY}' producer's enum ` +
          `[${[...declaredCategories].join(', ')}]`,
      })
    }
    const claimant = claimedElsewhere.get(section.category)
    if (claimant !== undefined) {
      errors.push({
        kind: 'invalid_digest_section',
        operatorId: op.operator_id,
        category: section.category,
        message:
          `Operator ${op.operator_id} section '${section.category}' is already ` +
          `claimed by digest edition ${claimant}; editions' category lists must be disjoint`,
      })
    }
    if (section.highlight) {
      const producer = findProducerOutput(postState, section.highlight.tag_key)
      const comparable =
        producer && 'valueType' in producer && (producer.valueType === 'money' || producer.valueType === 'date')
      if (producer && !comparable) {
        errors.push({
          kind: 'invalid_digest_section',
          operatorId: op.operator_id,
          category: section.category,
          message: `Operator ${op.operator_id} section '${section.category}' highlights on '${section.highlight.tag_key}', which is not an extracted 'money' or 'date' output (the types with a defined ordering)`,
        })
      }
    }
  }
  return errors
}

/** An Operator with its parsed config + derived Contract, for save-time checks. */
interface ParsedOperator {
  readonly operator_id: number
  readonly type_key: OperatorTypeKey
  readonly config: unknown
  readonly contract: Contract
}

/** Parse + derive every post-state Operator; unknown/invalid ones are skipped
 * ({@link validatePipeline} already rejected the save before this runs). */
function parsePostState(postState: readonly OperatorForValidation[]): ParsedOperator[] {
  const parsed: ParsedOperator[] = []
  for (const op of postState) {
    if (!isKnownType(op.type_key)) {
      continue
    }
    const config = operatorConfigSchemas[op.type_key].safeParse(safeJsonParse(op.config_json))
    if (!config.success) {
      continue
    }
    parsed.push({
      operator_id: op.operator_id,
      type_key: op.type_key,
      config: config.data,
      contract: deriveContract(op.type_key, config.data),
    })
  }
  return parsed
}

/**
 * The save-time-only checks for the Operator being created/edited, evaluated
 * against the post-change enabled set:
 *  - template placeholder names (unknown + reserved `name(...)` call form),
 *  - `when`-gate producer/enum membership ({@link whenGateErrors}),
 *  - digest section categories, disjointness, highlights
 *    ({@link digestSectionErrors}).
 *
 * Applied to the target Operator only (not the whole set, and not on
 * enable/disable/delete) and deliberately NOT part of {@link validatePipeline},
 * which also gates Triage enqueue: all of these degrade gracefully at run time
 * (an unknown placeholder renders empty; a stale gate value never matches; an
 * unclaimed category lands in the digest footer), so a pre-existing violation
 * elsewhere must not block unrelated saves or start failing enqueue — the goal
 * is to stop new mistakes at the door.
 */
export function saveTimeValidationErrors(
  target: OperatorForValidation,
  postState: readonly OperatorForValidation[],
): ValidationError[] {
  if (!isKnownType(target.type_key)) {
    return []
  }
  const typeKey = target.type_key
  const parsedTarget = operatorConfigSchemas[typeKey].safeParse(safeJsonParse(target.config_json))
  if (!parsedTarget.success) {
    return []
  }
  const config = parsedTarget.data as Record<string, unknown>
  const parsedPost = parsePostState(postState)

  const errors: ValidationError[] = [
    ...templatePlaceholderErrors(target, typeKey, config),
    ...whenGateErrors(target, config, parsedPost),
  ]
  if (typeKey === 'digest_delivery') {
    errors.push(...digestSectionErrors(target, config, parsedPost))
  }
  return errors
}

/**
 * Contract derivation over shared's generic {@link contractFromConfig}.
 * `config` is the already-validated output of
 * `operatorConfigSchemas[typeKey].safeParse`; the cast reasserts the per-key
 * pairing TypeScript can't track through the unlinked generic.
 */
function deriveContract(typeKey: OperatorTypeKey, config: unknown): Contract {
  return contractFromConfig(typeKey, config as OperatorConfigFor<OperatorTypeKey>)
}

function safeJsonParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    // Returning a non-object sentinel lets the Zod schema fail with a normal
    // "invalid config" error rather than throwing out of validation.
    return undefined
  }
}

/**
 * DFS cycle detection over operator dependency edges. Edge: producer(input) →
 * consumer. Returns the cycle as a list of operator_ids (closing back to the
 * first), or `null` when the graph is acyclic. Assumes single-producer (checked
 * earlier), so each input key maps to at most one producer.
 *
 * An operator consuming a key it produces itself is a cycle of length one, and
 * r-qu9y7wgg names it among the configurations that could not run: at execution
 * an operator becomes ready when every input key is present, so one waiting on
 * its own output never runs and never settles.
 */
function findCycle(
  contracts: ReadonlyMap<number, Contract>,
  producers: ReadonlyMap<string, number[]>,
): number[] | null {
  const adjacency = new Map<number, number[]>()
  for (const [operatorId, contract] of contracts) {
    const deps: number[] = []
    for (const inputKey of contract.inputs) {
      const ownerList = producers.get(inputKey)
      const owner = ownerList?.[0]
      if (owner !== undefined) {
        deps.push(owner)
      }
    }
    adjacency.set(operatorId, deps)
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<number, number>()
  for (const id of adjacency.keys()) {
    color.set(id, WHITE)
  }
  const stack: number[] = []

  const visit = (node: number): number[] | null => {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of adjacency.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        // Found a back-edge: extract the cycle from the stack.
        const start = stack.indexOf(next)
        return [...stack.slice(start), next]
      }
      if (color.get(next) === WHITE) {
        const found = visit(next)
        if (found) {
          return found
        }
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }

  for (const id of adjacency.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id)
      if (found) {
        return found
      }
    }
  }
  return null
}
