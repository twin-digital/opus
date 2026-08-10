/**
 * Pipeline write-pattern + validation surface (S2/S3). The execution loop (S7),
 * poll loop (S8), and HTTP routes consume this barrel: validation + the
 * `withPipelineEditLock`-wrapped mutations, Triage enqueue, the optimistic
 * claim, and run-completion/settlement.
 */

export { withPipelineEditLock } from './edit-lock.js'

export {
  type OperatorForValidation,
  type ValidationError,
  type ValidationResult,
  validateContractGraph,
  validatePipeline,
} from './validation.js'

export {
  type CreateOperatorInput,
  CredentialInUseError,
  type EditOperatorInput,
  NotFoundError,
  PipelineValidationError,
  createOperator,
  editOperator,
  setOperatorEnabled,
  softDeleteCredential,
  softDeleteOperator,
  softDeletePipeline,
} from './operator-save.js'

export {
  type CreatePipelineInput,
  type EditPipelineInput,
  PipelineNameConflictError,
  createPipeline,
  editPipeline,
} from './pipeline-config.js'

export { type EnqueueTriageInput, type EnqueueTriageResult, enqueueTriage } from './triage-enqueue.js'

export { claimOperatorRun } from './claim.js'

export {
  type OutputTag,
  type PersistResultArgs,
  type RunRef,
  type TriageEventInput,
  deriveTriageStatus,
  markSkipped,
  persistOperatorResult,
} from './persist.js'
