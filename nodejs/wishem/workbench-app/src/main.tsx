import {
  collectViews,
  ViewCollectionError,
  type InputPort,
  type PortReader,
  type ViewTable,
} from '@thrashplay/wishem-renderer-react'
import { createRoot } from 'react-dom/client'
import { connectHub } from './hub-client.js'
import { Page } from './Page.js'
import { reloadOnRestore } from './reload-on-restore.js'
import { loadProductViews, type ProductViews } from './tools/product-views.js'
import { collectAppViews } from './views.js'
import './styles/theme.css'

const loadViews = (): ViewTable => {
  try {
    return collectAppViews()
  } catch (error) {
    if (!(error instanceof ViewCollectionError)) {
      throw error
    }
    console.error(error.message)
    return collectViews({}, {})
  }
}

const root = document.getElementById('root')
if (root) {
  const views = loadViews()
  const page = createRoot(root)
  let productViews: ProductViews = { views: collectViews({}, {}) }
  let ports: { output: PortReader; input: InputPort } | undefined
  const draw = () => {
    page.render(<Page port={ports?.output} input={ports?.input} views={views} productViews={productViews} />)
  }
  draw()
  void loadProductViews().then((loaded) => {
    productViews = loaded
    draw()
  })
  reloadOnRestore(window, () => {
    location.reload()
  })
  connectHub({
    onPorts: ({ output, input }) => {
      ports = { output, input }
      draw()
    },
  })
}
