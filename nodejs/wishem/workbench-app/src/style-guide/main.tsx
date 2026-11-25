import { createRoot } from 'react-dom/client'
import '../styles/theme.css'
import { Principles } from './sections/Principles.js'
import { Tokens } from './sections/Tokens.js'
import { Typography } from './sections/Typography.js'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <main className='mx-auto grid max-w-[1200px] gap-14 px-6 pt-8 pb-24'>
      <header className='grid gap-2'>
        <h1 className='font-display text-h1 font-extrabold'>Wishem workbench style guide</h1>
        <p className='text-ui text-fg-muted'>Each section shows in light mode and in dark mode.</p>
      </header>
      <Principles />
      <Tokens />
      <Typography />
    </main>,
  )
}
