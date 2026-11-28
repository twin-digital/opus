import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentTypeDefinition, FieldValue } from '@thrashplay/wishem-core'
import { parseSidecar, REACT_KIND, stubViewTools } from '@thrashplay/wishem-renderer-react'
import { COLOR_CASES } from '@thrashplay/wishem-sample-product/color-cases'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ClearColor from './ClearColor.js'

const definition = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json',
    ),
    'utf8',
  ),
) as ComponentTypeDefinition
const sidecar = parseSidecar(JSON.parse(readFileSync(resolve(import.meta.dirname, 'ClearColor.view.json'), 'utf8')))

const markup = (color: FieldValue | undefined) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    createElement(ClearColor, { color, wishem: stubViewTools<{ color: FieldValue }>().tools }),
  )
  return container
}

describe('the ClearColor view', () => {
  it('has a sidecar of the kind react with the component type Color of the sample product', () => {
    expect(definition.label).toBe('Color')
    expect(sidecar).toEqual({ kind: REACT_KIND, componentType: 'ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512' })
    expect(sidecar?.componentType).toBe(definition.id)
  })

  it.each(COLOR_CASES)('fills the box with the color of the case "$name"', ({ value, color }) => {
    const container = markup(value)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    const fill = container.firstElementChild as HTMLElement

    expect(container.childElementCount).toBe(1)
    expect(fill.tagName).toBe('DIV')
    expect(fill.style.backgroundColor).toBe(`rgb(${r}, ${g}, ${b})`)
    expect(fill.style.position).toBe('absolute')
    expect(fill.style.inset).toBe('0px')
  })
})
