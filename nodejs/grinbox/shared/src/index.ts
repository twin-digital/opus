/**
 * `@twin-digital/grinbox-shared` — the declarative, cross-tier contract between the Daemon
 * (server) and the web SPA. Owns the stable vocabulary that both tiers agree
 * on: the Resource registry, the schema's closed/open enums, the Operator
 * `config_json` shapes keyed by `type_key`, the Contract skeleton + derivation,
 * the metered-client result type, and the default Limits.
 *
 * It does NOT own: Kysely DB row types, the runtime Operator implementations /
 * `runOperator` / credential-ref extraction / `code_version` (server
 * behavioral code), or HTTP route DTOs (added incrementally during route work).
 */

export * from './health.js'
export * from './resources.js'
export * from './enums.js'
export * from './operators.js'
export * from './contract.js'
export * from './resource-op-result.js'
export * from './limits.js'
export * from './match-vocabulary.js'
export * from './match-expression.js'
export * from './template-placeholder.js'
export * from './gmail-url.js'
export * from './account-display.js'
