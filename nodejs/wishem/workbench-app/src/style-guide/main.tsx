import { createRoot } from 'react-dom/client'
import '../styles/theme.css'
import { Components } from './sections/Components.js'
import { Principles } from './sections/Principles.js'
import { Tokens } from './sections/Tokens.js'
import { Typography } from './sections/Typography.js'

const root = document.getElementById('root')
if (root) {
  // An open menu takes focus when the page loads and scrolls the page to itself.
  if (location.hash === '') {
    setTimeout(() => {
      window.scrollTo(0, 0)
    }, 300)
  }
  createRoot(root).render(
    <main className='mx-auto grid max-w-[1200px] gap-14 px-6 pt-8 pb-24'>
      <header className='grid gap-2'>
        <h1 className='font-display text-h1 font-extrabold'>Wishem workbench style guide</h1>
        <p className='text-ui text-fg-muted'>Each section shows in light mode and in dark mode.</p>
      </header>
      <Principles />
      <Tokens />
      <Typography />
      <Components />
    </main>,
  )
}
