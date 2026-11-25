import { createRoot } from 'react-dom/client'
import { Page } from './Page.js'
import { collectViews, connect, ViewCollectionError, type ViewTable } from './renderer/index.js'
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
  page.render(<Page core={undefined} views={views} />)
  void connect().then((core) => {
    page.render(<Page core={core} views={views} />)
  })
}
