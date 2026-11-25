import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { checkViews, collectViews } from '../renderer/index.js'
import view from './AppBar.js'

const modelFolder = resolve(import.meta.dirname, '../../../workbench/model')
const definition = JSON.parse(
  readFileSync(resolve(modelFolder, 'definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json'), 'utf8'),
) as ComponentTypeDefinition

const markup = (title: string | undefined) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(view.render({ title }))
  return container
}

describe('the AppBar view', () => {
  it('declares the IDs of the definition file of the base workbench', () => {
    expect(view.componentType).toBe(definition.id)
    expect(view.props.title.field).toBe(definition.fields[0]?.id)
    expect(view.props.title.type).toBe(definition.fields[0]?.type)
  })

  it('has no difference against that definition', () => {
    const table = collectViews({ './views/AppBar.tsx': { default: view } })
    expect(checkViews(table, [definition])).toEqual([])
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
