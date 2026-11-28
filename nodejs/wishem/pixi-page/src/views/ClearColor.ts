import { Sprite, Texture } from 'pixi.js'
import type { PixiView } from '@thrashplay/wishem-renderer-pixi'
import type { FieldValue } from '@thrashplay/wishem-core'

const isColor = (value: FieldValue | undefined): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** Fills the viewport with the color of the prop `color`. Fills it with `#ff00ff` when the color is missing or is not `#rrggbb`. */
const view: PixiView<{ readonly color?: FieldValue }, Sprite> = {
  create: () => new Sprite(Texture.WHITE),
  update: (sprite, props, viewport) => {
    sprite.width = viewport.width
    sprite.height = viewport.height
    sprite.tint = Number.parseInt(isColor(props.color) ? props.color.slice(1) : 'ff00ff', 16)
    sprite.visible = true
  },
}

export default view
