import { describe, expect, it } from 'vitest'
import { contractFromConfig } from './contract.js'
import type { OperatorConfigFor } from './operators.js'

/**
 * `contractFromConfig` derivation tests. The bug these guard against: the
 * derivation used to leave `inputs` empty for every type, so the producer→
 * consumer dependency graph never formed an edge. These pin down the inputs
 * each type now declares from its config (the gate / Rule tag-refs) — the keys
 * the Pipeline orders on.
 */

describe('contractFromConfig — inputs', () => {
  describe('notify', () => {
    it('declares the when.tag_key as its sole input when `when` is present', () => {
      const config: OperatorConfigFor<'notify'> = {
        message_template: 'hi',
        credentials_id: 1,
        when: { tag_key: 'urgency', equals: ['high'] },
      }
      const contract = contractFromConfig('notify', config)
      expect(contract.inputs).toEqual(['urgency'])
      expect(contract.outputs).toEqual([])
    })

    it('declares no inputs when `when` is absent', () => {
      const config: OperatorConfigFor<'notify'> = {
        message_template: 'hi',
        credentials_id: 1,
      }
      expect(contractFromConfig('notify', config).inputs).toEqual([])
    })

    it('derives a template `{{tag.<key>}}` ref as an input even without `when`', () => {
      const config: OperatorConfigFor<'notify'> = {
        message_template: '{{tag.kind}}: {{subject}}',
        credentials_id: 1,
      }
      expect(contractFromConfig('notify', config).inputs).toEqual(['kind'])
    })

    it('unions the `when` gate and template refs, deduped', () => {
      const config: OperatorConfigFor<'notify'> = {
        message_template: '{{tag.a}} {{tag.b}} {{tag.a}}',
        credentials_id: 1,
        when: { tag_key: 'a', equals: ['x'] },
      }
      // `a` comes from the gate first, then `b` from the template; the
      // template's duplicate `a` is deduped.
      expect(contractFromConfig('notify', config).inputs).toEqual(['a', 'b'])
    })

    it('derives no template inputs from a Message-field-only template', () => {
      const config: OperatorConfigFor<'notify'> = {
        message_template: '{{from}} — {{subject}}',
        credentials_id: 1,
      }
      expect(contractFromConfig('notify', config).inputs).toEqual([])
    })
  })

  describe('apply_category', () => {
    it('declares the when.tag_key as its input', () => {
      const config: OperatorConfigFor<'apply_category'> = {
        category_template: 'Work',
        when: { tag_key: 'kind', equals: ['work'] },
      }
      expect(contractFromConfig('apply_category', config).inputs).toEqual(['kind'])
    })

    it('declares no inputs without `when`', () => {
      const config: OperatorConfigFor<'apply_category'> = {
        category_template: 'Work',
      }
      expect(contractFromConfig('apply_category', config).inputs).toEqual([])
    })

    it('derives a `{{tag.<key>}}` ref in category_template as an input', () => {
      const config: OperatorConfigFor<'apply_category'> = {
        category_template: 'Grinbox/{{tag.category}}',
      }
      expect(contractFromConfig('apply_category', config).inputs).toEqual(['category'])
    })
  })

  describe('rule_based_tagger', () => {
    it('declares the distinct tag.<key> refs across all Rules, deduped', () => {
      const config: OperatorConfigFor<'rule_based_tagger'> = {
        output_tag_key: 'route',
        output_value_enum: ['a', 'b'],
        rules: [
          { match: 'tag.urgency == "high"', output: 'a' },
          { match: 'tag.kind == "alert" or tag.urgency == "low"', output: 'b' },
        ],
        fallback: { output: 'b' },
      }
      const contract = contractFromConfig('rule_based_tagger', config)
      expect(contract.inputs).toEqual(['urgency', 'kind'])
      expect(contract.outputs).toEqual([{ key: 'route', valueEnum: ['a', 'b'] }])
    })

    it('declares no inputs when no Rule references a tag', () => {
      const config: OperatorConfigFor<'rule_based_tagger'> = {
        output_tag_key: 'route',
        output_value_enum: ['a', 'b'],
        rules: [{ match: 'from contains "acme.com"', output: 'a' }],
        fallback: { output: 'b' },
      }
      expect(contractFromConfig('rule_based_tagger', config).inputs).toEqual([])
    })

    it('tolerates an unparseable Rule `match`: skips its refs, never throws', () => {
      const config = {
        output_tag_key: 'route',
        output_value_enum: ['a', 'b'],
        rules: [
          { match: '(((', output: 'a' }, // malformed — contributes nothing
          { match: 'tag.kind == "x"', output: 'b' },
        ],
        fallback: { output: 'b' },
      }
      expect(() => contractFromConfig('rule_based_tagger', config)).not.toThrow()
      expect(contractFromConfig('rule_based_tagger', config).inputs).toEqual(['kind'])
    })
  })

  describe('llm_tagger', () => {
    it('declares no config-driven inputs; outputs are the declared tags', () => {
      const config: OperatorConfigFor<'llm_tagger'> = {
        model_id: 'm',
        prompt_template: 'p',
        outputs: [
          { tag_key: 'kind', value_enum: ['x', 'y'] },
          { tag_key: 'domain', value_enum: ['p', 'q'] },
        ],
      }
      const contract = contractFromConfig('llm_tagger', config)
      expect(contract.inputs).toEqual([])
      expect(contract.outputs.map((o) => o.key)).toEqual(['kind', 'domain'])
    })

    it('derives `{{tag.<key>}}` refs in prompt_template as inputs', () => {
      const config: OperatorConfigFor<'llm_tagger'> = {
        model_id: 'm',
        prompt_template: 'Given {{tag.urgency}} and {{subject}}, classify.',
        outputs: [{ tag_key: 'kind', value_enum: ['x', 'y'] }],
      }
      const contract = contractFromConfig('llm_tagger', config)
      expect(contract.inputs).toEqual(['urgency'])
      expect(contract.outputs.map((o) => o.key)).toEqual(['kind'])
    })
  })
})
