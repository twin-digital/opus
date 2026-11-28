import type { ComponentTypeDefinition, Entity, FieldValue, Id, Model } from '@thrashplay/wishem-core'
import type { Port } from '@thrashplay/wishem-hub'
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { ViewProps, ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'
import { findHolds } from './hold.js'
import { createViewTools, type InputPort } from './view-tools.js'
import { describeWarning, holdWarnings, viewWarnings } from './view-warnings.js'

/** The two operations of a port that a renderer uses. */
export type PortReader = Pick<Port, 'read' | 'subscribe'>

export interface RendererProps {
  port: PortReader
  views: ViewTable
  /** With no value, each input of a view has the outcome `not-permitted`. */
  input?: InputPort
}

interface ViewHostProps {
  view: ComponentType<ViewProps>
  entity: Id
  definition: ComponentTypeDefinition
  /** The props of the fields. */
  fields: Readonly<Record<string, FieldValue | ReactNode>>
  input: InputPort | undefined
}

/** Gives a view its fields and its tools. The tools stay the same until the input port, the entity, or the definition changes. */
const ViewHost = ({ view: View, entity, definition, fields, input }: ViewHostProps) => {
  const wishem = useMemo(
    () => createViewTools({ input, entity, componentType: definition.id, definition }),
    [input, entity, definition],
  )
  return createElement(View, Object.assign({}, fields, { wishem }))
}

/**
 * Draws each component that has a view, from the part `store` of the joined state of a port.
 * Each picture is in a wrapper that gives its entity and its component type.
 * A held entity is drawn only in the picture of its holder, as the prop of a `reference` field.
 * The renderer sends an input only when a view calls its tools, and only through `input`.
 * It attaches no subsystem and closes no port.
 */
export const Renderer = ({ port, views, input }: RendererProps) => {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port])
  const getStore = useCallback(() => port.read().store as Model | undefined, [port])
  const model = useSyncExternalStore(subscribe, getStore)

  const holds = useMemo(() => (model ? findHolds(views, model) : undefined), [views, model])
  const warnings = useMemo(
    () =>
      model ? [...viewWarnings(views, model.definitions), ...holdWarnings(views, model)].map(describeWarning) : [],
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

  if (!model || !holds) {
    return null
  }

  const entities = new Map(model.entities.map((entity) => [entity.id, entity]))

  /** One wrapper for each component of the entity that has a view. `path` holds the holders above it. */
  const draw = (entity: Entity, path: readonly Id[]): ReactNode[] => {
    const here = [...path, entity.id]
    return model.definitions.flatMap((definition) => {
      const component = entity.components[definition.id] as Entity['components'][string] | undefined
      const entry = views.get(definition.id)
      if (!component || !entry) {
        return []
      }
      const fields = Object.fromEntries(
        propNames(definition).props.map(({ name, field }): [string, FieldValue | ReactNode] => {
          const value: FieldValue | undefined = component[field.id]
          if (field.type !== 'reference' || typeof value !== 'string') {
            return [name, value]
          }
          const named = entities.get(value)
          return [name, named && !here.includes(value) ? draw(named, here) : null]
        }),
      )
      return [
        <div
          key={`${entity.id}:${definition.id}`}
          data-wishem-entity={entity.id}
          data-wishem-component-type={definition.id}
          style={{ display: 'contents' }}
        >
          <ViewHost view={entry.view} entity={entity.id} definition={definition} fields={fields} input={input} />
        </div>,
      ]
    })
  }

  return <>{model.entities.filter(({ id }) => !holds.held.has(id)).flatMap((entity) => draw(entity, []))}</>
}
