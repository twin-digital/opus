/**
 * Maps the write-pattern helper exceptions to an HTTP status + a structured
 * error body the UI can render. The UI depends on this shape: a JSON object
 * `{ error: { code, message, details? } }`, where `code` is a stable
 * machine-readable discriminator and `message` is human-readable (the toast /
 * inline-validation copy). `details` carries case-specific structured context
 * (e.g. the dependent Operator ids that block a Credential delete, or the
 * per-error list from a Pipeline validation failure).
 *
 * Status mapping:
 *  - validation rejections (output-key collision, cycle, dangling input, bad
 *    config, name/identity conflict, out-of-range cadence, credential-in-use) →
 *    `400` / `409`, a 4xx the UI surfaces inline.
 *  - not-found (Operator / Pipeline / Account / Limit / Credential) → `404`.
 *  - anything else rethrows (a real 500 — not a user-correctable condition).
 */

import { z } from 'zod'
import { PipelineNotAssignableError, PollIntervalOutOfRangeError } from '../../config/account-config.js'
import { LimitConflictError } from '../../config/limit-config.js'
import { CredentialInUseError, NotFoundError, PipelineValidationError } from '../../pipeline/operator-save.js'
import { PipelineNameConflictError } from '../../pipeline/pipeline-config.js'

/** A status + structured error body produced from a helper exception. */
export interface MappedError {
  readonly status: 400 | 404 | 409
  readonly body: {
    readonly error: {
      readonly code: string
      readonly message: string
      readonly details?: unknown
    }
  }
}

/**
 * Translate a thrown write-pattern error into a {@link MappedError}, or return
 * `null` if the error isn't a known user-correctable condition (the route then
 * rethrows it as a 500).
 */
export function mapWriteError(err: unknown): MappedError | null {
  if (err instanceof PipelineValidationError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'pipeline_validation_failed',
          message: err.message,
          details: err.errors,
        },
      },
    }
  }
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_config',
          message: 'The submitted configuration is invalid.',
          details: err.issues,
        },
      },
    }
  }
  if (err instanceof CredentialInUseError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'credential_in_use',
          message: err.message,
          details: { operator_ids: err.operatorIds },
        },
      },
    }
  }
  if (err instanceof PipelineNameConflictError) {
    return {
      status: 409,
      body: { error: { code: 'pipeline_name_conflict', message: err.message } },
    }
  }
  if (err instanceof LimitConflictError) {
    return {
      status: 409,
      body: { error: { code: 'limit_conflict', message: err.message } },
    }
  }
  if (err instanceof PollIntervalOutOfRangeError) {
    return {
      status: 400,
      body: {
        error: { code: 'poll_interval_out_of_range', message: err.message },
      },
    }
  }
  if (err instanceof PipelineNotAssignableError) {
    return {
      status: 400,
      body: {
        error: { code: 'pipeline_not_assignable', message: err.message },
      },
    }
  }
  if (err instanceof NotFoundError) {
    return {
      status: 404,
      body: { error: { code: 'not_found', message: err.message } },
    }
  }
  return null
}
