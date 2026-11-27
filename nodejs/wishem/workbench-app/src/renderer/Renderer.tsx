import type { ComponentTypeDefinition, Entity, Model } from '@thrashplay/wishem-core'
import { createElement, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ViewProps, ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

/** The read operations that the renderer uses. */
export interface ModelReader {
  getSnapshot(): Model
  /** Returns a function that removes the listener. */
  subscribe(listener: (model: Model) => void): () => void
}

export interface RendererProps {
  reader: ModelReader
  views: ViewTable
}

const propsOf = (definition: ComponentTypeDefinition, component: Entity['components'][string]): ViewProps =>
  Object.fromEntries(propNames(definition).props.map(({ name, field }) => [name, component[field.id]]))

/** Draws each component that has a view. Each picture is in a wrapper that gives its entity. */
export const Renderer = ({ reader, views }: RendererProps) => {
  const subscribe = useCallback((listener: () => void) => reader.subscribe(listener), [reader])
  const getSnapshot = useCallback(() => reader.getSnapshot(), [reader])
  const model = useSyncExternalStore(subscribe, getSnapshot)

  const warnings = useMemo(() => viewWarnings(views, model.definitions).map(describeWarning), [views, model])
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
      {model.entities.flatMap((entity) =>
        model.definitions.map((definition) => {
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
