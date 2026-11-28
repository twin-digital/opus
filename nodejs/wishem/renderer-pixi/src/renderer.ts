import { Container } from 'pixi.js'
import type { ComponentTypeDefinition, Entity, Id, Model } from '@thrashplay/wishem-core'
import { propNames } from './field-names.js'
import type { DrawnComponent, PixiRenderer, RendererOptions, ViewProps } from './types.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

interface Drawn extends DrawnComponent {
  display: Container
  /** True after a failed update hid the object. */
  failed: boolean
}

const NOT_READ = Symbol('not read')

const propsOf = (definition: ComponentTypeDefinition, component: Entity['components'][string]): ViewProps =>
  Object.fromEntries(propNames(definition).props.map(({ name, field }) => [name, component[field.id]]))

const keyOf = (entity: Id, componentType: Id): string => `${entity}:${componentType}`

const destroy = (display: Container): void => {
  if (!display.destroyed) {
    display.destroy({ children: true })
  }
}

/** Draws at once from `port.read()`, then after each event of the port. */
export const startRenderer = (options: RendererOptions): PixiRenderer => {
  const { port, views, stage, viewport } = options
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.error(error)
    })

  const root = new Container()
  stage.addChild(root)

  const drawn = new Map<string, Drawn>()
  let order: Drawn[] = []
  let lastPart: unknown = NOT_READ
  let stopped = false
  let lastWarnings = ''

  /** Writes the lines only when they differ from the last lines. */
  const warn = (definitions: readonly ComponentTypeDefinition[]): void => {
    const lines = viewWarnings(views, definitions).map(describeWarning)
    const text = lines.join('\n')
    if (text !== lastWarnings) {
      lastWarnings = text
      lines.forEach((line) => {
        console.warn(line)
      })
    }
  }

  /** Returns no value when the view throws. */
  const attempt = <T>(run: () => T): { value: T } | undefined => {
    try {
      return { value: run() }
    } catch (error) {
      onError(error)
      return undefined
    }
  }

  const sync = (): void => {
    if (stopped || root.destroyed) {
      return
    }
    const part = port.read().store as Model | undefined
    if (part === lastPart) {
      return
    }
    lastPart = part
    warn(part?.definitions ?? [])

    const next: Drawn[] = []
    const wanted = new Set<string>()
    for (const entity of part?.entities ?? []) {
      for (const definition of part?.definitions ?? []) {
        const component = entity.components[definition.id] as Entity['components'][string] | undefined
        const entry = views.get(definition.id)
        if (!component || !entry) {
          continue
        }
        const key = keyOf(entity.id, definition.id)
        wanted.add(key)

        let item = drawn.get(key)
        if (!item) {
          const created = attempt(() => entry.view.create())
          if (!created) {
            continue
          }
          item = { entity: entity.id, componentType: definition.id, display: created.value, failed: false }
          drawn.set(key, item)
          root.addChild(created.value)
        }

        const target = item
        if (
          attempt(() => {
            entry.view.update(target.display, propsOf(definition, component), viewport)
          })
        ) {
          if (target.failed) {
            target.display.visible = true
            target.failed = false
          }
        } else {
          target.display.visible = false
          target.failed = true
        }
        next.push(target)
      }
    }

    for (const [key, item] of drawn) {
      if (!wanted.has(key)) {
        drawn.delete(key)
        root.removeChild(item.display)
        destroy(item.display)
      }
    }

    next.forEach((item, index) => {
      if (root.children[index] !== item.display) {
        root.setChildIndex(item.display, index)
      }
    })
    order = next
  }

  const unsubscribe = port.subscribe((event) => {
    if (event.type !== 'stopping') {
      sync()
    }
  })
  sync()

  return {
    entityAt: (x, y) => {
      if (stopped || root.destroyed) {
        return undefined
      }
      for (let index = order.length - 1; index >= 0; index -= 1) {
        const { display, entity, componentType } = order[index]
        if (display.visible && !display.destroyed && display.getBounds().containsPoint(x, y)) {
          return { entity, componentType }
        }
      }
      return undefined
    },
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      unsubscribe()
      drawn.clear()
      order = []
      root.removeFromParent()
      destroy(root)
    },
  }
}
