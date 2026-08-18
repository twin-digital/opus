/**
 * Detection of body-consuming Operator configs, for the lazy Message-body
 * fetch (d-nol93aud: the body is fetched only where the Operator about to run
 * reads it, determined from that Operator's configuration). An Operator
 * consumes the body when its config actually reads it:
 *
 *  - `llm_tagger` / `notify` / `apply_category` / `set_aside`: the rendered
 *    template (`prompt_template` / `message_template` / `category_template`)
 *    contains a `{{body}}` placeholder.
 *  - `rule_based_tagger`: any Rule's `match` expression references the bare
 *    `body` Message field.
 *  - `archive` / `file`: never — neither config carries a template or an
 *    expression; a File's folder is a literal name.
 *  - `digest_delivery`: never — its section templates run at digest time,
 *    outside any Triage; a `{{body}}` placeholder there renders whatever body
 *    is already cached (or empty) and never triggers a fetch.
 *
 * Built on the same shared grammar sources the renderer and Contract
 * derivation use ({@link templateReferencesBody},
 * {@link extractMessageFieldRefs}), so "consumes the body" can't drift from
 * what rendering/evaluation actually reads.
 */

import { extractMessageFieldRefs } from './match-expression.js'
import type { OperatorConfigFor, OperatorTypeKey } from './operators.js'
import { templateReferencesBody } from './template-placeholder.js'

/**
 * Whether an Operator with this `typeKey` + validated `config` reads the
 * Message body when it runs. A Rule whose `match` doesn't parse contributes
 * nothing — mirroring `contractFromConfig`'s posture, derivation over an
 * already-invalid expression must not throw (the save validator and run-time
 * compile report invalidity).
 */
export function operatorConsumesBody<K extends OperatorTypeKey>(typeKey: K, config: OperatorConfigFor<K>): boolean {
  switch (typeKey) {
    case 'llm_tagger': {
      const c = config as OperatorConfigFor<'llm_tagger'>
      return templateReferencesBody(c.prompt_template)
    }
    case 'notify': {
      const c = config as OperatorConfigFor<'notify'>
      return templateReferencesBody(c.message_template)
    }
    case 'apply_category': {
      const c = config as OperatorConfigFor<'apply_category'>
      return templateReferencesBody(c.category_template)
    }
    case 'set_aside': {
      const c = config as OperatorConfigFor<'set_aside'>
      return templateReferencesBody(c.category_template)
    }
    case 'rule_based_tagger': {
      const c = config as OperatorConfigFor<'rule_based_tagger'>
      return c.rules.some((rule) => {
        try {
          return extractMessageFieldRefs(rule.match).includes('body')
        } catch {
          // Unparseable `match`: reads nothing.
          return false
        }
      })
    }
    case 'archive':
    case 'file':
    case 'digest_delivery':
      return false
  }
}
