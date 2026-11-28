// A view that sends inputs through the prop `wishem`. Prints the outcome of each call.
// Usage: node view-inputs.mjs
// This file uses the built packages and the jsdom of workbench-app, after the build.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../workbench-app/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const { createRoot } = require('react-dom/client')
const { act, createElement } = require('react')

const dom = new JSDOM('<div id="root"></div>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createStore } = await import('../../../core/dist/index.js')
const { createHub } = await import('../../../hub/dist/index.js')
const { collectViews, Renderer } = await import('../../../renderer-react/dist/index.js')

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const model = {
  definitions: [{ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2', components: { [CT]: { [FLD]: 'Wishem' } } }],
}

// The view prints the outcome of each call.
const AppBar = ({ title, wishem }) => {
  const run = async (label, call) => {
    console.log(`${label}: ${JSON.stringify(await call())}`)
  }
  return createElement(
    'button',
    {
      onClick: async () => {
        await run('setField title', () => wishem.setField('title', 'Wishem studio'))
        await run('setField nothing', () => wishem.setField('nothing', 'x'))
        await run('submit unknown type', () => wishem.submit({ type: 'nothing/do' }))
      },
    },
    title,
  )
}
const views = collectViews(
  { './AppBar.view.json': { default: { kind: 'react', componentType: CT } } },
  { './AppBar.tsx': { default: AppBar } },
)

const click = async (label, props) => {
  console.log(`--- ${label}`)
  document.body.innerHTML = '<div id="root"></div>'
  const root = createRoot(document.getElementById('root'))
  await act(async () => {
    root.render(createElement(Renderer, { views, ...props }))
  })
  await act(async () => {
    document.querySelector('button').click()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  console.log(`button text: ${document.querySelector('button').textContent}`)
  await act(async () => {
    root.unmount()
  })
}

const hub = createHub({ subsystems: [createStore({ model })] })
hub.start()
const port = hub.attach({ id: 'screen', kind: 'output' })
const input = hub.attach({ id: 'screen-input', kind: 'input' })
await click('with an input port', { port, input })
console.log(`record: ${JSON.stringify(hub.record().map(({ seq, type, source }) => ({ seq, type, source })))}`)
await click('with no input port', { port })
hub.stop()
