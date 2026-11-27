import type { ComponentTypeDefinition, Entity, Model } from '@thrashplay/wishem-core'
import type { Port } from '@thrashplay/wishem-hub'
import { createElement, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ViewProps, ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

/** The two operations of a port that a renderer uses. */
export type PortReader = Pick<Port, 'read' | 'subscribe'>

export interface RendererProps {
  port: PortReader
  views: ViewTable
}

const propsOf = (definition: ComponentTypeDefinition, component: Entity['components'][string]): ViewProps =>
  Object.fromEntries(propNames(definition).props.map(({ name, field }) => [name, component[field.id]]))

/**
 * Draws each component that has a view, from the part `store` of the joined state of a port.
 * Each picture is in a wrapper that gives its entity and its component type.
 * The renderer only reads. It does not close the port.
 */
export const Renderer = ({ port, views }: RendererProps) => {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port])
  const getStore = useCallback(() => port.read().store as Model | undefined, [port])
  const model = useSyncExternalStore(subscribe, getStore)

  const warnings = useMemo(
    () => (model ? viewWarnings(views, model.definitions).map(describeWarning) : []),
    [views, model],
  )
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

  if (!model) {
    return null
  }

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
