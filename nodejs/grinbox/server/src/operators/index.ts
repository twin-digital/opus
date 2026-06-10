/**
 * The server-side Operator framework surface (S1). Composes the behavioral
 * layer (`run`, `code_version`, credential-ref extraction, `runOperator`) onto
 * `@twin-digital/grinbox-shared`'s declarative registry. The worker (S7), save-time
 * validation (S2/S3), and later Operator waves (O2+) consume this barrel.
 */

export type {
  GmailApplyLabelArgs,
  GmailClient,
  GmailFetchArgs,
  GmailListArgs,
  GmailSendArgs,
  LlmBedrockClient,
  LlmInvokeArgs,
  LlmUsage,
  MakeResourceClient,
  MessageView,
  OperatorRunInput,
  OperatorRunResult,
  OperatorType,
  PushoverClient,
  PushoverSendArgs,
  ResourceClients,
} from './types.js'
export { messageViewFromRow } from './types.js'

export {
  type ImplementedTypeKey,
  UnknownOperatorTypeError,
  currentCodeVersion,
  getOperatorType,
  listOperatorTypes,
  resolveSnapshot,
} from './registry.js'

export {
  InvalidOperatorConfigError,
  type OperatorSnapshot,
  OutputTagValidationError,
  type RunOperatorArgs,
  runOperator,
} from './run.js'

export { extractCredentialRefsFromConfigJson, extractCredentialRefsFromOperatorConfig } from './credential-refs.js'

export { ruleBasedTaggerType } from './built-ins/rule-based-tagger.js'
export {
  type CompiledMatch,
  type MatchContext,
  MatchExpressionError,
  compileMatch,
} from './built-ins/match-expression.js'
