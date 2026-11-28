import { createRoot } from 'react-dom/client'
import '../styles/theme.css'
import { Components } from './sections/Components.js'
import { Principles } from './sections/Principles.js'
import { Tokens } from './sections/Tokens.js'
import { Typography } from './sections/Typography.js'

const root = document.getElementById('root')
if (root) {
  // An open menu takes focus on load and scrolls the page. Reset the scroll until the first input of a person.
  if (location.hash === '') {
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    const reset = () => {
      window.scrollTo(0, 0)
    }
    const stop = () => {
      document.removeEventListener('focusin', reset)
      for (const input of inputs) {
        document.removeEventListener(input, stop)
      }
    }
    document.addEventListener('focusin', reset)
    for (const input of inputs) {
      document.addEventListener(input, stop, { passive: true })
    }
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
