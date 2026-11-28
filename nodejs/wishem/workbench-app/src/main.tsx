import { collectViews, ViewCollectionError, type ViewTable } from '@thrashplay/wishem-renderer-react'
import { createRoot } from 'react-dom/client'
import { connectHub } from './hub-client.js'
import { Page } from './Page.js'
import { reloadOnRestore } from './reload-on-restore.js'
import { loadProductViews } from './tools/product-views.js'
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
  const productViews = await loadProductViews()
  const page = createRoot(root)
  page.render(<Page port={undefined} input={undefined} views={views} productViews={productViews} />)
  reloadOnRestore(window, () => {
    location.reload()
  })
  connectHub({
    onPorts: ({ output, input }) => {
      page.render(<Page port={output} input={input} views={views} productViews={productViews} />)
    },
  })
}
