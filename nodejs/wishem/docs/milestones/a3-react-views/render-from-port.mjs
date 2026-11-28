// Draws one view from a direct port and from a remote port of a link. Shows that both ports give the same picture.
// Usage: node render-from-port.mjs
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
const { createHub, openLink, webSocketChannel } = await import('../../../hub/dist/index.js')
const { startConstruct } = await import('../../../host-nodejs/dist/index.js')
const { collectViews, Renderer } = await import('../../../renderer-react/dist/index.js')

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const model = {
  definitions: [{ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2', components: { [CT]: { [FLD]: 'Wishem' } } }],
}
const views = collectViews(
  { './AppBar.view.json': { default: { kind: 'react', componentType: CT } } },
  { './AppBar.tsx': { default: ({ title }) => createElement('h1', null, title) } },
)

const draw = async (label, port) => {
  const root = createRoot(document.getElementById('root'))
  await act(async () => {
    root.render(createElement(Renderer, { port, views }))
  })
  console.log(`${label}: ${document.getElementById('root').innerHTML}`)
  await act(async () => {
    root.unmount()
  })
}

// A direct port of a hub in this process.
const hub = createHub({ subsystems: [createStore({ model })] })
hub.start()
await draw('direct port', hub.attach({ id: 'screen', kind: 'output' }))
hub.stop()

// A remote port of a link to a construct in this process.
const folder = process.argv[2] ?? new URL('../../../workbench/model', import.meta.url).pathname
const construct = await startConstruct({ folder, port: 0 })
const link = await openLink(await webSocketChannel(new WebSocket(construct.linkUrl)), [
  { id: 'screen', kind: 'output' },
])
await draw('remote port', link.ports.screen)
link.close()
await construct.close()
