/** Whether a parsed JSON value is an object — the container the manifest format documents. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses JSON that may carry a byte-order mark. `readFile` leaves a BOM in the string and
 * `JSON.parse` rejects it, and both package managers' own readers strip it — a manifest saved by
 * a Windows editor is well-formed, not unreadable.
 */
export function parseJson(contents: string): unknown {
  return JSON.parse(contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents)
}

/** The message of a thrown value, whatever it turned out to be. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
