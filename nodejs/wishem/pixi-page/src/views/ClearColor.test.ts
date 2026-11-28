import { Sprite } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { CLEAR_COLOR_TYPE } from '../construct/model.js'
import sidecar from './ClearColor.view.json'
import view from './ClearColor.js'

const viewport = { width: 640, height: 360 }

describe('the ClearColor view', () => {
  it('makes a sprite', () => {
    expect(view.create()).toBeInstanceOf(Sprite)
  })

  it('covers the viewport with the color', () => {
    const sprite = view.create()
    view.update(sprite, { color: '#1d4ed8' }, viewport)
    expect(sprite.visible).toBe(true)
    expect(sprite.width).toBe(640)
    expect(sprite.height).toBe(360)
    expect(sprite.x).toBe(0)
    expect(sprite.y).toBe(0)
    expect(sprite.tint).toBe(0x1d4ed8)
  })

  it('covers a smaller viewport after a second update', () => {
    const sprite = view.create()
    view.update(sprite, { color: '#1d4ed8' }, viewport)
    view.update(sprite, { color: '#1d4ed8' }, { width: 320, height: 180 })
    expect(sprite.width).toBe(320)
    expect(sprite.height).toBe(180)
  })

  it('hides the sprite for a value that is not a color, with no error', () => {
    const sprite = view.create()
    expect(() => {
      view.update(sprite, { color: 'blue-ish' }, viewport)
    }).not.toThrow()
    expect(sprite.visible).toBe(false)
  })

  it('hides the sprite when the prop has no value', () => {
    const sprite = view.create()
    view.update(sprite, {}, viewport)
    expect(sprite.visible).toBe(false)
  })

  it('hides the sprite for a value that is not text', () => {
    const sprite = view.create()
    view.update(sprite, { color: 5 }, viewport)
    expect(sprite.visible).toBe(false)
  })

  it('shows the sprite again for a color after a value that is not a color', () => {
    const sprite = view.create()
    view.update(sprite, { color: 'blue-ish' }, viewport)
    view.update(sprite, { color: '#b91c1c' }, viewport)
    expect(sprite.visible).toBe(true)
    expect(sprite.tint).toBe(0xb91c1c)
  })

  it('belongs to the Clear color component type', () => {
    expect(sidecar).toEqual({ kind: 'pixi', componentType: CLEAR_COLOR_TYPE })
  })
})
