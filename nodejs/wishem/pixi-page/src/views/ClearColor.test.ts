import { Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { COLOR_TYPE } from '@thrashplay/wishem-sample-product'
import { COLOR_CASES } from '@thrashplay/wishem-sample-product/color-cases'
import sidecar from './ClearColor.view.json'
import view from './ClearColor.js'

const viewport = { width: 640, height: 360 }

describe('the ClearColor view', () => {
  it('makes a sprite', () => {
    expect(view.create()).toBeInstanceOf(Sprite)
  })

  it.each(COLOR_CASES)('covers the viewport with the color of the case "$name"', ({ value, color }) => {
    const sprite = view.create()
    view.update(sprite, value === undefined ? {} : { color: value }, viewport)
    expect(sprite.visible).toBe(true)
    expect(sprite.width).toBe(640)
    expect(sprite.height).toBe(360)
    expect(sprite.x).toBe(0)
    expect(sprite.y).toBe(0)
    expect(sprite.tint).toBe(Number.parseInt(color.slice(1), 16))
  })

  it('covers a smaller viewport after a second update', () => {
    const sprite = view.create()
    view.update(sprite, { color: '#1d4ed8' }, viewport)
    view.update(sprite, { color: '#1d4ed8' }, { width: 320, height: 180 })
    expect(sprite.width).toBe(320)
    expect(sprite.height).toBe(180)
  })

  it('draws each case after any other case as if it came first', () => {
    const sprite = view.create()
    for (const previous of COLOR_CASES) {
      for (const { value, color } of COLOR_CASES) {
        view.update(sprite, previous.value === undefined ? {} : { color: previous.value }, viewport)
        view.update(sprite, value === undefined ? {} : { color: value }, viewport)
        expect(sprite.visible).toBe(true)
        expect(sprite.tint).toBe(Number.parseInt(color.slice(1), 16))
      }
    }
  })

  it('belongs to the Color component type of the sample product', () => {
    expect(sidecar).toEqual({ kind: 'pixi', componentType: COLOR_TYPE })
  })
})
