/**
 * Shared structured-error wrapper for the typed `hc<ApiRoutes>` client. The
 * daemon's write routes return `{ error: { code, message, details? } }`
 * (server `write-errors.ts`): `code` is a stable machine discriminator, `message`
 * is the human-readable toast/inline copy, and `details` carries case-specific
 * context (e.g. the dependent Operator ids that block a Credential delete). The
 * settings mutation hooks throw this so pages can branch on `code` and read
 * `details` without re-parsing the response.
 */
export class ApiError extends Error {
  readonly code: string
  readonly details: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown } | string
}

/** Pull a code + human message (+ details) out of an API error response. */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    // non-JSON error body; fall through to a generic message
  }
  if (body.error && typeof body.error === 'object') {
    return new ApiError(
      body.error.code ?? 'error',
      body.error.message ?? `Request failed (HTTP ${res.status}).`,
      body.error.details,
    )
  }
  if (typeof body.error === 'string') {
    return new ApiError(body.error, `Request failed (HTTP ${res.status}).`)
  }
  return new ApiError('error', `Request failed (HTTP ${res.status}).`)
}

/** Best-effort human message for a thrown mutation error. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return 'Something went wrong.'
}
