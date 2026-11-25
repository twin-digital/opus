import type { CoreReader, Entity } from '@thrashplay/wishem-core'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { checkViews, describeDifference } from './check-views.js'
import type { ViewTable } from './collect-views.js'

export interface RendererProps {
  core: CoreReader
  views: ViewTable
}

/** Draws each component that has a view. Each picture is in a wrapper that gives its entity. */
export const Renderer = ({ core, views }: RendererProps) => {
  const subscribe = useCallback((listener: () => void) => core.subscribe(listener), [core])
  const getSnapshot = useCallback(() => core.getSnapshot(), [core])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const differences = useMemo(() => checkViews(views, snapshot.definitions).map(describeDifference), [views, snapshot])
  const lastWarned = useRef('')
  useEffect(() => {
    const text = differences.join('\n')
    if (text === lastWarned.current) {
      return
    }
    lastWarned.current = text
    differences.forEach((line) => {
      console.warn(line)
    })
  }, [differences])

  return (
    <>
      {snapshot.entities.flatMap((entity) =>
        snapshot.definitions.map((definition) => {
          const component = entity.components[definition.id] as Entity['components'][string] | undefined
          const entry = views.get(definition.id)
          if (!component || !entry) {
            return null
          }
          const { view } = entry
          const props = Object.fromEntries(
            Object.entries(view.props).map(([name, declaration]) => [name, component[declaration.field]]),
          )
          return (
            <div
              key={`${entity.id}:${definition.id}`}
              data-wishem-entity={entity.id}
              data-wishem-component-type={definition.id}
              style={{ display: 'contents' }}
            >
              {view.render(props)}
            </div>
          )
        }),
      )}
    </>
  )
}
