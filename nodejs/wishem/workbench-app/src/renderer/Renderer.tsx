import type { ComponentTypeDefinition, CoreReader, Entity } from '@thrashplay/wishem-core'
import { createElement, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ViewProps, ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

export interface RendererProps {
  core: CoreReader
  views: ViewTable
}

const propsOf = (definition: ComponentTypeDefinition, component: Entity['components'][string]): ViewProps =>
  Object.fromEntries(propNames(definition).props.map(({ name, field }) => [name, component[field.id]]))

/** Draws each component that has a view. Each picture is in a wrapper that gives its entity. */
export const Renderer = ({ core, views }: RendererProps) => {
  const subscribe = useCallback((listener: () => void) => core.subscribe(listener), [core])
  const getSnapshot = useCallback(() => core.getSnapshot(), [core])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const warnings = useMemo(() => viewWarnings(views, snapshot.definitions).map(describeWarning), [views, snapshot])
  const lastWarned = useRef('')
  useEffect(() => {
    const text = warnings.join('\n')
    if (text === lastWarned.current) {
      return
    }
    lastWarned.current = text
    warnings.forEach((line) => {
      console.warn(line)
    })
  }, [warnings])

  return (
    <>
      {snapshot.entities.flatMap((entity) =>
        snapshot.definitions.map((definition) => {
          const component = entity.components[definition.id] as Entity['components'][string] | undefined
          const entry = views.get(definition.id)
          if (!component || !entry) {
            return null
          }
          return (
            <div
              key={`${entity.id}:${definition.id}`}
              data-wishem-entity={entity.id}
              data-wishem-component-type={definition.id}
              style={{ display: 'contents' }}
            >
              {createElement(entry.view, propsOf(definition, component))}
            </div>
          )
        }),
      )}
    </>
  )
}
