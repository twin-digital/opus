/**
 * `@grinbox/shared` — the contracts grinbox's daemon and browser application both
 * speak. It owns the vocabulary both tiers agree on: the resource registry, the
 * closed and open enums, the operator configuration shapes keyed by type key, the
 * contract skeleton and its derivation, the metered-client result type, the match
 * expression and template placeholder grammars, the seeded limits, the offered
 * models, the notification-kind and cooldown vocabulary, the pending-archive
 * vocabulary, the money display form, and the shape a refused write answers in.
 *
 * It does not own the daemon's database row types, the runtime operator
 * implementations, or the API's route shapes — the browser application is typed
 * from the server's own route definitions, which compose these shapes
 * (d-j4huq3jy declares the payload vocabulary once, here; d-5l0wqcj0 infers the
 * envelopes from the routes).
 */

export { healthSchema } from './health.js'
export type { Health } from './health.js'

export {
  isResourceOperation,
  RESOURCE_OPERATIONS,
  resourceOperationDeclarationSchema,
  resourceOperationSchema,
  resourceSchema,
} from './resources.js'
export type { Resource, ResourceOperation, ResourceOperationDeclaration, ResourceOperationsMap } from './resources.js'

export {
  changeLogActionSchema,
  changeLogEntityTypeSchema,
  credentialKindSchema,
  limitScopeSchema,
  operatorRunStatusSchema,
  providerTypeSchema,
  sourceStateSchema,
  triageEventTypeSchema,
  triageStatusSchema,
  triggeredBySchema,
} from './enums.js'
export type {
  ChangeLogAction,
  ChangeLogEntityType,
  CredentialKind,
  LimitScope,
  OperatorRunStatus,
  ProviderType,
  SourceState,
  TriageEventType,
  TriageStatus,
  TriggeredBy,
} from './enums.js'

export {
  actionWhenSchema,
  applyCategoryConfigSchema,
  archiveConfigSchema,
  categoryTemplateSchema,
  digestColumnSchema,
  digestDeliveryConfigSchema,
  digestHighlightSchema,
  digestProseBlockSchema,
  digestSectionSchema,
  DIGEST_CATEGORY_TAG_KEY,
  extractedValueTypeSchema,
  fallbackSchema,
  fileConfigSchema,
  isScheduledOperatorType,
  llmTaggerConfigSchema,
  llmTaggerOutputSchema,
  notifyConfigSchema,
  operatorConfigSchemas,
  operatorTypeKeySchema,
  OPERATOR_TYPE_TRIGGERS,
  ruleBasedTaggerConfigSchema,
  ruleSchema,
  setAsideConfigSchema,
  tagKeySchema,
  valueEnumSchema,
} from './operators.js'
export type {
  ActionWhen,
  ApplyCategoryConfig,
  ArchiveConfig,
  DigestColumn,
  DigestDeliveryConfig,
  DigestHighlight,
  DigestProseBlock,
  DigestSection,
  ExtractedValueType,
  Fallback,
  FileConfig,
  LlmTaggerConfig,
  LlmTaggerOutput,
  NotifyConfig,
  OperatorConfigFor,
  OperatorTypeKey,
  Rule,
  RuleBasedTaggerConfig,
  SetAsideConfig,
  TagKey,
  ValueEnum,
} from './operators.js'

export {
  contractFromConfig,
  contractSchema,
  operatorTypeRegistry,
  outputDeclarationSchema,
  STATIC_RESOURCES,
} from './contract.js'
export type { Contract, OutputDeclaration } from './contract.js'

export type { ResourceOpResult } from './resource-op-result.js'

export { DEFAULT_LIMITS, limitDefinitionSchema } from './limits.js'
export type { LimitDefinition } from './limits.js'

export { MATCH_FIELD_PREFIXES, MATCH_MESSAGE_FIELDS, MATCH_OPERATORS, MATCH_VOCABULARY } from './match-vocabulary.js'
export type { MatchFieldPrefix, MatchMessageField, MatchOperator, MatchVocabulary } from './match-vocabulary.js'

export { compileMatch, extractMessageFieldRefs, extractTagRefs, MatchExpressionError } from './match-expression.js'
export type { CompiledMatch, FieldLookup } from './match-expression.js'

export {
  extractReservedCallPlaceholders,
  extractTemplateTagRefs,
  extractUnknownTemplatePlaceholders,
  isReservedCallPlaceholder,
  templateReferencesBody,
  TEMPLATE_MESSAGE_FIELDS,
  TEMPLATE_PLACEHOLDER,
} from './template-placeholder.js'

export { operatorConsumesBody } from './body-usage.js'

export {
  CATEGORY_FORBIDDEN_CHARS,
  CATEGORY_REPLACEMENT_CHAR,
  forbiddenCategoryChars,
  forbiddenCategoryTemplateChars,
  isValidCategoryName,
  sanitizeCategoryName,
} from './category-name.js'

export { accountFoldersSchema, folderNameSchema, folderRoleSchema, folderSchema, FOLDER_ROLES } from './folders.js'
export type { AccountFolders, Folder, FolderName, FolderRole } from './folders.js'

export {
  imapAccountCredentialsSchema,
  imapAccountSettingsSchema,
  imapAccountSetupSchema,
  imapConnectionSecuritySchema,
  imapPortSchema,
} from './imap-account.js'
export type {
  ImapAccountCredentials,
  ImapAccountSettings,
  ImapAccountSetup,
  ImapConnectionSecurity,
} from './imap-account.js'

export {
  accountCapabilitiesSchema,
  accountCapabilitySchema,
  accountCapabilityWarningSchema,
  ACCOUNT_CAPABILITIES,
  capabilitiesRequiredBy,
  mailBackendKindSchema,
  MAIL_BACKEND_KINDS,
} from './backends.js'
export type { AccountCapabilities, AccountCapability, AccountCapabilityWarning, MailBackendKind } from './backends.js'

export { cooldownIntervalSecondsSchema, cooldownSettingSchema, notificationKindSchema } from './notifications.js'
export type { CooldownIntervalSeconds, CooldownSetting, NotificationKind } from './notifications.js'

export { archiveDelaySecondsSchema, pendingArchiveSchema, pendingArchiveSkipReasonSchema } from './pending-archive.js'
export type { ArchiveDelaySeconds, PendingArchive, PendingArchiveSkipReason } from './pending-archive.js'

export { formatMoneyDisplay } from './money-display.js'

export { API_ERROR_CODES, apiErrorBodySchema } from './api-error.js'
export type { ApiErrorBody, ApiErrorCode } from './api-error.js'

export { MODEL_IDS, MODELS, modelIdSchema, modelLabel } from './models.js'
export type { ModelId, ModelOption } from './models.js'

export {
  ACCOUNT_COLORS,
  ACCOUNT_ICONS,
  DEFAULT_ACCOUNT_ICON,
  isAccountColor,
  isAccountIcon,
} from './account-display.js'
export type { AccountColor, AccountIcon } from './account-display.js'
