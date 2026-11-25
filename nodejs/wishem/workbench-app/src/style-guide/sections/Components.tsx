import type { ReactNode } from 'react'
import { AppBar } from '../../components/AppBar.js'
import { ZeroState } from '../../components/ZeroState.js'
import { Section } from '../Section.js'

/** Holds one specimen. A header in a section is not a banner landmark. */
const Specimen = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label} className='grid gap-2'>
    <span className='font-mono text-label font-medium text-fg-muted uppercase'>{label}</span>
    <div className='overflow-hidden rounded-md border border-line'>{children}</div>
  </section>
)

/** The components of the workbench, each in each state. */
export const Components = () => (
  <Section id='components' title='Components'>
    <Specimen label='App bar'>
      <AppBar title='Wishem' />
    </Specimen>
    <Specimen label='App bar, long title'>
      <div className='w-[260px]'>
        <AppBar title='A title that is much longer than the bar can show' />
      </div>
    </Specimen>
    <Specimen label='Zero state'>
      <div className='h-[150px]'>
        <ZeroState label='Workbench' message='Nothing to show yet.' />
      </div>
    </Specimen>
  </Section>
)
