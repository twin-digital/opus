import { Color, Sprite, Texture } from 'pixi.js'
import type { PixiView } from '@thrashplay/wishem-renderer-pixi'
import type { FieldValue } from '@thrashplay/wishem-core'

/** The color as a number, or no value when PixiJS cannot convert the value. */
const toTint = (value: FieldValue | undefined): number | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  try {
    return new Color(value).toNumber()
  } catch {
    return undefined
  }
}

/** Fills the viewport with the color of the prop `color`. */
const view: PixiView<{ readonly color?: FieldValue }, Sprite> = {
  create: () => new Sprite(Texture.WHITE),
  update: (sprite, props, viewport) => {
    sprite.width = viewport.width
    sprite.height = viewport.height
    const tint = toTint(props.color)
    if (tint === undefined) {
      sprite.visible = false
      return
    }
    sprite.tint = tint
    sprite.visible = true
  },
}

export default view
