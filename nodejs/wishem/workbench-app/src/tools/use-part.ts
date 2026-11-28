import type { PortReader } from '@thrashplay/wishem-renderer-react'
import { useCallback, useSyncExternalStore } from 'react'

/** The part of the joined state with this key. Draws again when the part changes by identity. */
export const usePart = (port: PortReader, key: string): unknown => {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port])
  const getPart = useCallback(() => (port.read() as Record<string, unknown>)[key], [port, key])
  return useSyncExternalStore(subscribe, getPart)
}
