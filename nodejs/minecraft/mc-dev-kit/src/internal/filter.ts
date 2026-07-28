import type { PackCriteria, PackEntry } from '../types.js'
import { isRecord } from './json.js'

/**
 * Whether an entry satisfies every criterion given.
 *
 * Each criterion matches exactly, and a criterion whose value the entry does not carry never
 * matches. `uuid` is the one departure: both sides are lowercased before comparing, so a
 * case-varied spelling of the same uuid still matches. Empty criteria match every entry.
 */
export function matchesCriteria(entry: PackEntry, criteria: PackCriteria): boolean {
  if (criteria.status !== undefined && entry.status !== criteria.status) {
    return false
  }
  if (criteria.package !== undefined && entry.packageName !== criteria.package) {
    return false
  }
  if (criteria.uuid !== undefined && entry.uuid?.toLowerCase() !== criteria.uuid.toLowerCase()) {
    return false
  }
  if (criteria.name !== undefined && headerName(entry) !== criteria.name) {
    return false
  }
  return true
}

/** The completed manifest's header name, where the entry carries one. */
function headerName(entry: PackEntry): string | undefined {
  const manifest: unknown = entry.manifest
  if (!isRecord(manifest) || !isRecord(manifest.header)) {
    return undefined
  }
  return typeof manifest.header.name === 'string' ? manifest.header.name : undefined
}
