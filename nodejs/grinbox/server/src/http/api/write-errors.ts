/**
 * Maps the write-pattern helper exceptions to an HTTP status and the structured
 * refusal `d-u2rotm38` requires: a refusal names what was wrong and where — the
 * field, the operator, the offending value — rather than a sentence for a human
 * to read, and the interface composes what the user sees from that. The body
 * shape (`ApiErrorBody`) and the codes grinbox produces (`API_ERROR_CODES`) are
 * declared in `@grinbox/shared`, so the browser parses what the daemon composes.
 *
 * Status mapping:
 *  - validation rejections (output-key collision, cycle, dangling input, bad
 *    config, name/identity conflict, out-of-range cadence, credential-in-use) →
 *    `400` / `409`, a 4xx the UI surfaces inline.
 *  - not-found (Operator / Pipeline / Account / Limit / Credential) → `404`.
 *  - anything else rethrows (a real 500 — not a user-correctable condition).
 */

import type { ApiErrorBody } from '@grinbox/shared'
import { z } from 'zod'
import { PipelineNotAssignableError, PollIntervalOutOfRangeError } from '../../config/account-config.js'
import { CooldownConflictError, InvalidKindNameError } from '../../config/cooldown-config.js'
import { LimitConflictError, SeededLimitError } from '../../config/limit-config.js'
import { CredentialInUseError, NotFoundError, PipelineValidationError } from '../../pipeline/operator-save.js'
import { PipelineNameConflictError } from '../../pipeline/pipeline-config.js'

/** A status + the structured refusal body produced from a helper exception. */
export interface MappedError {
  readonly status: 400 | 404 | 409
  readonly body: ApiErrorBody
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
      body: { error: { code: 'name_conflict', message: err.message } },
    }
  }
  if (err instanceof SeededLimitError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'seeded_limit',
          message: err.message,
          details: { limit_id: err.limitId },
        },
      },
    }
  }
  if (err instanceof LimitConflictError) {
    return {
      status: 409,
      body: { error: { code: 'limit_conflict', message: err.message } },
    }
  }
  if (err instanceof CooldownConflictError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'cooldown_conflict',
          message: err.message,
          details: { kind: err.kind },
        },
      },
    }
  }
  if (err instanceof InvalidKindNameError) {
    return {
      status: 400,
      body: { error: { code: 'invalid_kind_name', message: err.message } },
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
