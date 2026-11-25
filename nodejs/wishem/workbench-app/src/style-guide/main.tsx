import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<p data-testid='proof'>Style guide proof</p>)
}
