import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseSidecar, REACT_KIND, stubViewTools } from '@thrashplay/wishem-renderer-react'
import { collectAppViews } from '../views.js'
import view from './AppBar.js'
import type { Values } from './AppBar.view.gen.js'

const modelFolder = resolve(import.meta.dirname, '../../../workbench/model')
const definition = JSON.parse(
  readFileSync(resolve(modelFolder, 'definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json'), 'utf8'),
) as ComponentTypeDefinition
const sidecar = parseSidecar(JSON.parse(readFileSync(resolve(import.meta.dirname, 'AppBar.view.json'), 'utf8')))

const markup = (title: string | undefined) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(createElement(view, { title, wishem: stubViewTools<Values>().tools }))
  return container
}

describe('the AppBar view', () => {
  it('has a sidecar with the ID of the definition file of the base workbench', () => {
    expect(sidecar).toEqual({ kind: REACT_KIND, componentType: definition.id })
  })

  it('is in the table of the views, under the ID of its component type', () => {
    expect(collectAppViews().get(definition.id)).toMatchObject({ sidecar: 'AppBar.view.json', view })
  })

  it('draws the app bar with the title', () => {
    expect(markup('Wishem').querySelector('h1')?.textContent).toBe('Wishem.')
  })

  it('draws the app bar with an empty title when the prop has no value', () => {
    const heading = markup(undefined).querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('.')
  })
})
