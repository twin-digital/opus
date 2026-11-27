import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
// The README example imports from the entries of the packages. The test imports the same names from the source.
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { collectViews, Renderer, type ViewProps } from './index.js'

const CT_APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD_TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'

const model = {
  definitions: [
    { id: CT_APP_BAR, label: 'AppBar', fields: [{ id: FLD_TITLE, label: 'title', type: 'string' as const }] },
  ],
  entities: [{ id: 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2', components: { [CT_APP_BAR]: { [FLD_TITLE]: 'Wishem' } } }],
}

it('runs the example of the README', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = '<div id="root"></div>'

  const hub = createHub({ subsystems: [createStore({ model })] })
  hub.start()
  const port = hub.attach({ id: 'screen', kind: 'output' })
  const views = collectViews(
    { './views/AppBar.view.json': { default: { kind: 'react', componentType: CT_APP_BAR } } },
    { './views/AppBar.tsx': { default: ({ title }: ViewProps) => <h1>{title}</h1> } },
  )

  act(() => {
    createRoot(document.getElementById('root') as HTMLElement).render(<Renderer port={port} views={views} />)
  })

  expect(document.querySelector('h1')?.textContent).toBe('Wishem')
})
