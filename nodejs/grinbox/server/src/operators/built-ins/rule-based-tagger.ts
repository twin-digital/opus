/**
 * O1 — Rule-based Tagger. A deterministic Tagger that produces exactly one
 * output Tag by evaluating an ordered Rule list first-match-wins, falling back
 * to the fallback when no Rule matches (d-imlec3nt, d-f5hy6ptl).
 *
 * Declares no Resources and touches no DB. The `match` of each Rule is a safe
 * expression over Message fields and input Tags — see `match-expression.ts` for
 * the grammar.
 */

import { type RuleBasedTaggerConfig, contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { MessageView } from '../types.js'
import type { OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'
import { type CompiledMatch, buildFieldLookup, compileMatch } from './match-expression.js'

/**
 * The pure decision function at the heart of the Rule-based Tagger: evaluates
 * the ordered Rule list first-match-wins against the Message + input Tags and
 * returns the single output Tag value, falling back to `config.fallback.output`
 * when no Rule matches.
 *
 * Every Rule's `match` is compiled up front, so a malformed expression throws a
 * {@link MatchExpressionError} deterministically rather than silently never
 * matching. This helper is the single source of the match-expression /
 * first-match logic — both the Operator's `run` and the draft-config preview
 * (`POST /api/operators/preview`) call it, so the preview and the live Operator
 * can never diverge.
 */
export function evaluateRuleBasedTagger(
  config: RuleBasedTaggerConfig,
  message: MessageView,
  tags: ReadonlyMap<string, string>,
): string {
  const compiled: CompiledMatch[] = config.rules.map((rule) => compileMatch(rule.match))

  const lookup = buildFieldLookup({ message, tags })
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].evaluate(lookup)) {
      return config.rules[i].output
    }
  }
  return config.fallback.output
}

/**
 * Evaluates the optional `when` gate, then the Rule list against the Message +
 * input Tags, and emits the single output Tag. When the gate fires (or is
 * absent), the fallback (config's `fallback.output`) guarantees an output; a
 * gated Tagger that doesn't fire emits nothing — not even the fallback — and
 * downstream Operators that depend on its output cascade-skip.
 */
function run(input: OperatorRunInput<'rule_based_tagger'>): Promise<OperatorRunResult> {
  const { config, message, tags } = input
  if (!shouldFire(config.when, tags)) {
    return Promise.resolve({ tags: [] })
  }
  const value = evaluateRuleBasedTagger(config, message, tags)
  return Promise.resolve({ tags: [{ key: config.output_tag_key, value }] })
}

/** Rule-based Tagger uses no Credentials. */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const ruleBasedTaggerType: OperatorType<'rule_based_tagger'> = {
  type_key: 'rule_based_tagger',
  code_version: '1',
  configSchema: operatorConfigSchemas.rule_based_tagger,
  contractFromConfig: (c) => contractFromConfig('rule_based_tagger', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
