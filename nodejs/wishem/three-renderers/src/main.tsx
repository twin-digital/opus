import { collectViews } from '@thrashplay/wishem-renderer-react'
import { createRoot } from 'react-dom/client'
import { ReactPage } from './ReactPage.js'

const linkUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/link`
const createSocket = (address: string) => new WebSocket(address)

const views = collectViews(
  import.meta.glob('./views/*.view.json', { eager: true }),
  import.meta.glob(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }),
)

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<ReactPage url={linkUrl()} createSocket={createSocket} views={views} />)
}
