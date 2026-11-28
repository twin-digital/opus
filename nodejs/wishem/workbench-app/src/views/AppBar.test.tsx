import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
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

const edit = async (outcome: Parameters<typeof stubViewTools<Values>>[0], text: string) => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const { tools, calls } = stubViewTools<Values>(outcome)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(view, { title: 'Wishem', wishem: tools }))
  })
  act(() => {
    container.querySelector('button')?.click()
  })
  act(() => {
    const input = container.querySelector('input')
    if (input) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await act(async () => {
    container.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await Promise.resolve()
  })
  const result = {
    calls,
    alert: container.querySelector('[role="alert"]')?.textContent,
    hasField: !!container.querySelector('input'),
  }
  act(() => {
    root.unmount()
  })
  container.remove()
  return result
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

  it('sends the new title with setField and shows the state "not saved" for a rejection', async () => {
    const { calls, alert } = await edit({ ok: false, reason: 'not-running', problems: [] }, 'Wishem studio')
    expect(calls).toEqual([{ kind: 'setField', name: 'title', value: 'Wishem studio' }])
    expect(alert).toBe('The title is not saved. The workbench does not run. Start it, and try again.')
  })

  it('closes the field when the outcome is accepted', async () => {
    const { calls, alert, hasField } = await edit({ ok: true, seq: 4 }, 'Wishem studio')
    expect(calls).toEqual([{ kind: 'setField', name: 'title', value: 'Wishem studio' }])
    expect(alert).toBeUndefined()
    expect(hasField).toBe(false)
  })
})
