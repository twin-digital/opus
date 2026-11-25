import { createRoot } from 'react-dom/client'
import { ZeroState } from './components/ZeroState.js'
import './styles/theme.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <main className='h-screen'>
      <ZeroState label='Workbench' message='Nothing to show yet.' />
    </main>,
  )
}
