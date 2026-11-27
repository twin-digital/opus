import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createStore } from '@thrashplay/wishem-core'
import { createHub, type Port } from '@thrashplay/wishem-hub'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Page, type PageProps } from './Page.js'
import { collectAppViews } from './views.js'

const modelFolder = resolve(import.meta.dirname, '../../workbench/model')
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(modelFolder, path), 'utf8'))
const state = readJson('state.json') as { entities: unknown[] }
const definition = readJson('definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json')

const views = collectAppViews()

/** A port of a real hub whose store holds the base model of the workbench. */
const basePort = (): Port => {
  const hub = createHub({
    subsystems: [createStore({ model: { definitions: [definition], entities: state.entities } })],
  })
  hub.start()
  return hub.attach({ id: 'screen', kind: 'output' })
}

describe('Page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const draw = (props: PageProps) => {
    act(() => {
      root.render(<Page {...props} />)
    })
  }

  it('shows the zero state in a main element and no app bar when there is no port', () => {
    draw({ port: undefined, views })
    expect(container.querySelector('main')?.textContent).toContain('Workbench')
    expect(container.querySelector('main')?.textContent).toContain('Nothing to show yet.')
    expect(container.querySelector('header')).toBeNull()
  })

  it('shows the app bar before the zero state, outside the main element', () => {
    draw({ port: basePort(), views })
    const header = container.querySelector('header')
    const main = container.querySelector('main')
    expect(header?.textContent).toBe('Wishem.')
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(main?.querySelector('header')).toBeNull()
    expect(main?.contains(header)).toBe(false)
    expect(header?.compareDocumentPosition(main as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('draws from the port with no close and no input', () => {
    const port = basePort()
    const close = vi.spyOn(port, 'close')
    const submit = vi.spyOn(port, 'submit')
    draw({ port, views })
    expect(container.querySelector('header')).not.toBeNull()
    act(() => {
      root.unmount()
    })
    expect(close).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    root = createRoot(container)
  })
})
