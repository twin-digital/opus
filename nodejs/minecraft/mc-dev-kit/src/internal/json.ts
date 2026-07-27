/** Whether a parsed JSON value is an object — the container the manifest format documents. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The message of a thrown value, whatever it turned out to be. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
