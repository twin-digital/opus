import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { parseSidecar, REACT_KIND, stubViewTools } from '@thrashplay/wishem-renderer-react'
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

const markup = (color: string | undefined) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    createElement(ClearColor, { color, wishem: stubViewTools<{ color: string }>().tools }),
  )
  return container
}

describe('the ClearColor view', () => {
  it('has a sidecar of the kind react with the component type Color of the sample product', () => {
    expect(definition.label).toBe('Color')
    expect(sidecar).toEqual({ kind: REACT_KIND, componentType: 'ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512' })
    expect(sidecar?.componentType).toBe(definition.id)
  })

  it('fills the box with the color of the prop', () => {
    const fill = markup('#1d4ed8').firstElementChild as HTMLElement

    expect(fill.style.backgroundColor).toBe('rgb(29, 78, 216)')
    expect(fill.style.position).toBe('absolute')
    expect(fill.style.inset).toBe('0px')
  })

  it('draws nothing when the prop has no value', () => {
    expect(markup(undefined).childElementCount).toBe(0)
  })
})
