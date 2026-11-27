import type { Id } from '@thrashplay/wishem-core'

export interface Sidecar {
  kind: string
  componentType: Id
}

export const REACT_KIND = 'react'

/** Returns no value when the data is not a sidecar. */
export const parseSidecar = (value: unknown): Sidecar | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const { kind, componentType } = value as Record<string, unknown>
  return typeof kind === 'string' && typeof componentType === 'string' ? { kind, componentType } : undefined
}
