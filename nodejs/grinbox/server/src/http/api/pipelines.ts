/**
 * `/api/pipelines` — the Pipeline list + detail the Pipelines page reads
 * (ui-design.md "Pipeline detail + Operator editor").
 *
 *  - `GET /api/pipelines` — one row per live Pipeline: name, description, and
 *    "active on N Accounts" (the count of live Accounts whose
 *    `active_pipeline_id` points here).
 *  - `GET /api/pipelines/:id` — detail: the Pipeline's live Operators in
 *    **topological order** (producer before consumer), with mutually-independent
 *    Operators sharing a `group` index so the UI can bracket them; each Operator
 *    carries its type/name/enabled + its derived Contract + its parsed (non-secret)
 *    `config` so the editor can pre-populate on edit; plus the read-only
 *    **tag-key registry** auto-derived from the enabled Operators' declared
 *    outputs.
 *
 * The topo order is a Kahn levelization over the producer→consumer DAG built
 * from each Operator's derived Contract (output key → input key edges). An
 * Operator's inputs are derived from its config — an Action's `when` gate, a
 * Rule-based Tagger's `tag.<key>` Rule refs, and the `{{tag.<key>}}` refs in any
 * template field (Notify's `message_template`, Apply Category's
 * `category_template`, the LLM Tagger's `prompt_template`) — so Operators level
 * by Tag dependency: a consumer of a Tag lands in a later group than its
 * producer, and mutually-independent Operators share a group. Disabled Operators
 * are included in the
 * listing (the editor shows them) but excluded from the tag-key registry and
 * from the dependency graph, mirroring the save-time validator's enabled-only
 * scope.
 */

import type { Contract } from '@twin-digital/grinbox-shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiDeps } from './deps.js'
import { deriveContractForRow } from './operator-contract.js'

export interface PipelineSummary {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly active_account_count: number
}

export interface OperatorDetail {
  readonly id: number
  readonly name: string
  readonly type_key: string
  readonly enabled: boolean
  /** Topological level; mutually-independent Operators share a level index. */
  readonly group: number
  /** Derived Contract, or `null` for an unknown type / unparseable config. */
  readonly contract: Contract | null
  /**
   * The Operator's stored config, parsed from `config_json`, so the editor can
   * pre-populate its fields when editing. Non-secret: an Operator config holds
   * rules / prompts / templates / model id and at most an integer
   * `credentials_id` reference (never the credential's secret material).
   * `null` when the stored JSON doesn't parse.
   */
  readonly config: unknown
}

/** One entry in a Pipeline's read-only tag-key registry. */
export interface TagKeyRegistryEntry {
  readonly key: string
  /** The id of the enabled Operator that declares this output key. */
  readonly producer_operator_id: number
  readonly value_enum: readonly string[]
}

export interface PipelineDetail extends PipelineSummary {
  readonly operators: readonly OperatorDetail[]
  readonly tag_key_registry: readonly TagKeyRegistryEntry[]
}

const idParam = z.object({ id: z.coerce.number().int().positive() })

/**
 * Parse a stored Operator `config_json` for the editor's pre-population. Returns
 * the parsed value, or `null` when the stored text doesn't parse (the read
 * surface reports what's in the DB rather than failing the whole request — the
 * write path is where config validity is enforced).
 */
function parseConfigJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function createPipelinesRoutes(deps: ApiDeps) {
  return new Hono()
    .get('/', async (c) => {
      const rows = await deps.db
        .selectFrom('pipelines')
        .where('pipelines.deleted_at', 'is', null)
        .select(['id', 'name', 'description'])
        .orderBy('name', 'asc')
        .execute()

      // "active on N accounts" per Pipeline, in one grouped query.
      const counts = await deps.db
        .selectFrom('accounts')
        .where('deleted_at', 'is', null)
        .where('active_pipeline_id', 'is not', null)
        .select((eb) => ['active_pipeline_id as pipeline_id', eb.fn.countAll<number>().as('n')])
        .groupBy('active_pipeline_id')
        .execute()
      const countByPipeline = new Map<number, number>()
      for (const c of counts) {
        if (c.pipeline_id !== null) {
          countByPipeline.set(c.pipeline_id, c.n)
        }
      }

      const pipelines: PipelineSummary[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        active_account_count: countByPipeline.get(r.id) ?? 0,
      }))
      return c.json({ pipelines })
    })
    .get('/:id', zValidator('param', idParam), async (c) => {
      const { id } = c.req.valid('param')
      const pipeline = await deps.db
        .selectFrom('pipelines')
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .select(['id', 'name', 'description'])
        .executeTakeFirst()
      if (!pipeline) {
        return c.json({ error: 'pipeline_not_found' }, 404)
      }

      const operatorRows = await deps.db
        .selectFrom('operators')
        .where('pipeline_id', '=', id)
        .where('deleted_at', 'is', null)
        .select(['id', 'name', 'type_key', 'config_json', 'enabled'])
        .orderBy('id', 'asc')
        .execute()

      const contracts = new Map<number, Contract | null>()
      for (const op of operatorRows) {
        contracts.set(op.id, deriveContractForRow(op.type_key, op.config_json))
      }

      const groups = topoGroups(
        operatorRows.map((op) => ({
          id: op.id,
          enabled: op.enabled === 1,
          contract: contracts.get(op.id) ?? null,
        })),
      )

      const operators: OperatorDetail[] = operatorRows
        .map((op) => ({
          id: op.id,
          name: op.name,
          type_key: op.type_key,
          enabled: op.enabled === 1,
          group: groups.get(op.id) ?? 0,
          contract: contracts.get(op.id) ?? null,
          config: parseConfigJson(op.config_json),
        }))
        .sort((a, b) => a.group - b.group || a.id - b.id)

      // Tag-key registry: declared outputs of *enabled* Operators only (the
      // single-producer invariant is enabled-scoped), in operator order.
      const tagKeyRegistry: TagKeyRegistryEntry[] = []
      for (const op of operatorRows) {
        if (op.enabled !== 1) {
          continue
        }
        const contract = contracts.get(op.id)
        if (!contract) {
          continue
        }
        for (const out of contract.outputs) {
          tagKeyRegistry.push({
            key: out.key,
            producer_operator_id: op.id,
            value_enum: out.valueEnum,
          })
        }
      }

      const accountCount = await deps.db
        .selectFrom('accounts')
        .where('deleted_at', 'is', null)
        .where('active_pipeline_id', '=', id)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst()

      const detail: PipelineDetail = {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        active_account_count: accountCount?.n ?? 0,
        operators,
        tag_key_registry: tagKeyRegistry,
      }
      return c.json({ pipeline: detail })
    })
}

export interface GraphNode {
  readonly id: number
  readonly enabled: boolean
  readonly contract: Contract | null
}

/**
 * Kahn levelization of the producer→consumer DAG. Each Operator's level is the
 * longest dependency chain reaching it; Operators at the same level are
 * mutually independent and share a `group` index. Disabled Operators and
 * Operators with no derivable Contract participate as level-0 sources (they
 * declare no usable edges). On a cyclic or otherwise unsatisfiable graph
 * (which the write-time validator forbids, but the read path can't assume),
 * any nodes left unlevelled fall back to level 0 so the response is always
 * total.
 */
export function topoGroups(nodes: readonly GraphNode[]): Map<number, number> {
  // Map each output Tag key to the enabled Operator that produces it.
  const producerOf = new Map<string, number>()
  for (const n of nodes) {
    if (!n.enabled || !n.contract) {
      continue
    }
    for (const out of n.contract.outputs) {
      if (!producerOf.has(out.key)) {
        producerOf.set(out.key, n.id)
      }
    }
  }

  // Build dependency edges: an Operator depends on the producers of its inputs.
  const deps = new Map<number, Set<number>>()
  for (const n of nodes) {
    const set = new Set<number>()
    if (n.enabled && n.contract) {
      for (const input of n.contract.inputs) {
        const producer = producerOf.get(input)
        if (producer !== undefined && producer !== n.id) {
          set.add(producer)
        }
      }
    }
    deps.set(n.id, set)
  }

  const level = new Map<number, number>()
  // Iterate to a fixpoint: a node's level is 1 + max(level of its deps).
  // Bounded by node count (longest chain ≤ N), so at most N passes.
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let changed = false
    for (const n of nodes) {
      const myDeps = deps.get(n.id)
      let lvl = 0
      let ready = true
      if (myDeps) {
        for (const d of myDeps) {
          const dl = level.get(d)
          if (dl === undefined) {
            ready = false
            break
          }
          lvl = Math.max(lvl, dl + 1)
        }
      }
      if (ready && level.get(n.id) !== lvl) {
        level.set(n.id, lvl)
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }

  // Any node still unlevelled (part of a cycle) falls back to level 0.
  for (const n of nodes) {
    if (!level.has(n.id)) {
      level.set(n.id, 0)
    }
  }
  return level
}
