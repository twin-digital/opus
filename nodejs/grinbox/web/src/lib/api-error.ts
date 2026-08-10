import { apiErrorBodySchema } from '@grinbox/shared'

/**
 * Structured-error wrapper for the typed `hc<ApiRoutes>` client. The envelope
 * itself — `{ error: { code, message, details? } }` — is declared once in
 * `@grinbox/shared` and parsed with its schema here, so the browser reads
 * exactly what the daemon composes (d-u2rotm38).
 *
 * `code` is the stable machine discriminator a page branches on, `message` is
 * the toast/inline copy, and `details` carries the case-specific structure — the
 * per-error list from a pipeline validation failure, the dependent operator ids
 * that block a credential delete. The mutation hooks throw this so pages read
 * `code` and `details` without re-parsing the response.
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

/** Pull a code + human message (+ details) out of an API error response. */
export async function toApiError(res: Response): Promise<ApiError> {
  const fallback = `Request failed (HTTP ${res.status.toString()}).`

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return new ApiError('error', fallback)
  }

  const parsed = apiErrorBodySchema.safeParse(body)
  if (!parsed.success) {
    return new ApiError('error', fallback)
  }

  const { code, message, details } = parsed.data.error
  return new ApiError(code, message === '' ? fallback : message, details)
}

/** Best-effort human message for a thrown mutation error. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return 'Something went wrong.'
}
