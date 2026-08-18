/**
 * Which Accounts cannot carry part of a Pipeline, and why (d-qzxvoph1).
 *
 * A configuration is never refused for naming an operation some Account cannot
 * carry: saving the Pipeline and activating it on an Account each **warn**,
 * naming the Accounts that cannot carry it, and the Operator fails on those
 * Accounts when it runs. So this returns warnings beside a successful write —
 * never a refusal.
 *
 * What an Account can carry is its own stored declaration, read at its last poll
 * (d-bzw8qoiy). An Account that has never polled has no declaration and is not
 * warned about: nothing is yet known about it, and a warning naming it would be
 * a guess.
 */

import {
  type AccountCapability,
  type AccountCapabilityWarning,
  type OperatorConfigFor,
  type OperatorTypeKey,
  capabilitiesRequiredBy,
  contractFromConfig,
  operatorConfigSchemas,
  operatorTypeRegistry,
} from '@grinbox/shared'
import type { DB } from '../db/schema.js'
import { accountSupports, parseCapabilities } from '../providers/account-capabilities.js'

/** The capabilities each enabled Operator of the Pipeline needs of an Account. */
async function requiredByOperator(db: DB, pipelineId: number): Promise<Map<AccountCapability, number[]>> {
  const operators = await db
    .selectFrom('operators')
    .select(['id', 'type_key', 'config_json'])
    .where('pipeline_id', '=', pipelineId)
    .where('deleted_at', 'is', null)
    .where('enabled', '=', 1)
    .execute()

  const byCapability = new Map<AccountCapability, number[]>()
  for (const operator of operators) {
    if (!Object.hasOwn(operatorTypeRegistry, operator.type_key)) {
      continue
    }
    const typeKey = operator.type_key as OperatorTypeKey
    const parsed = operatorConfigSchemas[typeKey].safeParse(JSON.parse(operator.config_json) as unknown)
    if (!parsed.success) {
      // A config that does not parse cannot be reasoned about; the save path's
      // own validation is what refuses it.
      continue
    }
    const contract = contractFromConfig(typeKey, parsed.data as OperatorConfigFor<OperatorTypeKey>)
    for (const capability of capabilitiesRequiredBy(contract)) {
      byCapability.set(capability, [...(byCapability.get(capability) ?? []), operator.id])
    }
  }
  return byCapability
}

/**
 * Warn for each capability the Pipeline needs that some Account cannot carry.
 * `accountIds` narrows the Accounts considered — activation asks about the one
 * Account it is activating on; a save asks about every Account the Pipeline is
 * already active on.
 */
export async function capabilityWarnings(
  db: DB,
  pipelineId: number,
  accountIds?: readonly number[],
): Promise<AccountCapabilityWarning[]> {
  const required = await requiredByOperator(db, pipelineId)
  if (required.size === 0) {
    return []
  }

  let query = db
    .selectFrom('accounts')
    .select(['id', 'capabilities_json'])
    .where('deleted_at', 'is', null)
    .where('capabilities_json', 'is not', null)
  if (accountIds === undefined) {
    query = query.where('active_pipeline_id', '=', pipelineId)
  } else if (accountIds.length > 0) {
    query = query.where('id', 'in', [...accountIds])
  } else {
    return []
  }

  const accounts = (await query.execute()).map((row) => ({
    id: row.id,
    capabilities: parseCapabilities(row.capabilities_json),
  }))

  const warnings: AccountCapabilityWarning[] = []
  for (const [capability, operatorIds] of required) {
    const lacking = accounts.filter((account) => !accountSupports(account.capabilities, capability)).map((a) => a.id)
    if (lacking.length > 0) {
      warnings.push({ capability, operator_ids: operatorIds, account_ids: lacking })
    }
  }
  return warnings
}

/** The Pipeline an Operator belongs to, or null where the Operator is gone. */
export async function pipelineOfOperator(db: DB, operatorId: number): Promise<number | null> {
  const row = await db.selectFrom('operators').select('pipeline_id').where('id', '=', operatorId).executeTakeFirst()
  return row?.pipeline_id ?? null
}
