import { createRoot } from 'react-dom/client'
import './styles/theme.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<p className='p-6 text-ui'>Workbench</p>)
}
