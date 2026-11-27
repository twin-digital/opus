import { Container, Sprite, Texture } from 'pixi.js'
import { expect, it } from 'vitest'
// The README example imports from '@thrashplay/wishem-renderer-pixi'.
import { createStore } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { collectViews, startRenderer } from './index.js'
import type { PixiView } from './index.js'

const CLEAR_COLOR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const COLOR_FIELD = 'fld_9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const ENTITY = 'e_5b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b'

const model: Model = {
  definitions: [
    { id: CLEAR_COLOR, label: 'Clear color', fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }] },
  ],
  entities: [{ id: ENTITY, components: { [CLEAR_COLOR]: { [COLOR_FIELD]: '#1d4ed8' } } }],
}

const clearColor: PixiView<{ readonly color?: string }, Sprite> = {
  create: () => new Sprite(Texture.WHITE),
  update: (sprite, props, viewport) => {
    sprite.width = viewport.width
    sprite.height = viewport.height
    sprite.tint = props.color ?? '#000000'
  },
}

// The test gives the modules that `import.meta.glob` gives in a Vite application.
const sidecarModules = { './views/ClearColor.view.json': { default: { kind: 'pixi', componentType: CLEAR_COLOR } } }
const viewModules = { './views/ClearColor.ts': { default: clearColor } }

it('runs the example of the README', () => {
  const hub = createHub({ subsystems: [createStore({ model })] })
  hub.start()
  const port = hub.attach({ id: 'screen', kind: 'output' })
  const views = collectViews(sidecarModules, viewModules)
  const stage = new Container()
  const renderer = startRenderer({ port, views, stage, viewport: { width: 640, height: 360 } })

  expect(renderer.entityAt(10, 10)).toEqual({ entity: ENTITY, componentType: CLEAR_COLOR })
  expect(stage.children[0].children).toHaveLength(1)

  renderer.stop()
  port.close()

  expect(stage.children).toHaveLength(0)
})
