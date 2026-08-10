import { describe, expect, it } from 'vitest'
import { UnknownOperatorTypeError } from '../operators/registry.js'
import type { OperatorSnapshot } from '../operators/run.js'
import { resolveSnapshotContract } from './resolve-contract.js'

/**
 * Tests the real snapshot → registry → contract path. The execution-loop
 * integration tests inject a synthetic resolver, so this is the only coverage
 * of `resolveSnapshotContract` resolving against the code-resident registry.
 */
describe('resolveSnapshotContract', () => {
  it('resolves a valid rule_based_tagger snapshot to its declared output key', () => {
    const snapshot: OperatorSnapshot = {
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: JSON.stringify({
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [],
        fallback: { output: 'low' },
      }),
    }
    const contract = resolveSnapshotContract(snapshot)
    // Rule-based Tagger declares no inputs and owns its single output key.
    expect(contract.inputKeys).toEqual([])
    expect(contract.outputKeys).toEqual(['urgency'])
  })

  it('resolves a valid llm_tagger snapshot to one output key per declared output', () => {
    const snapshot: OperatorSnapshot = {
      type_key: 'llm_tagger',
      type_code_version: '1',
      op_config_json: JSON.stringify({
        model_id: 'anthropic.claude',
        prompt_template: 'classify {{subject}}',
        outputs: [
          { tag_key: 'category', value_enum: ['work', 'personal'] },
          { tag_key: 'urgency', value_enum: ['high', 'low'] },
        ],
      }),
    }
    const contract = resolveSnapshotContract(snapshot)
    expect(contract.inputKeys).toEqual([])
    expect(contract.outputKeys).toEqual(['category', 'urgency'])
  })

  it('throws UnknownOperatorTypeError for an unknown type_key', () => {
    const snapshot: OperatorSnapshot = {
      type_key: 'no_such_type',
      type_code_version: '1',
      op_config_json: '{}',
    }
    expect(() => resolveSnapshotContract(snapshot)).toThrow(UnknownOperatorTypeError)
  })

  it('throws when op_config_json is invalid for the resolved type', () => {
    // The type resolves, but the config fails the type's configSchema (missing
    // required fields) → the schema's parse throws, surfacing to the loop.
    const snapshot: OperatorSnapshot = {
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: JSON.stringify({ output_tag_key: 'urgency' }),
    }
    expect(() => resolveSnapshotContract(snapshot)).toThrow()
  })
})
