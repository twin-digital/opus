import type { ReactNode } from 'react'
import type { FieldDefinition } from '@thrashplay/wishem-core'
import { AppBar, type RenameOutcome } from '../../components/AppBar.js'
import { FieldRow, type ChangeOutcome, type ReferenceOption } from '../../components/FieldRow.js'
import { ZeroState } from '../../components/ZeroState.js'
import { Section } from '../Section.js'

/** Holds one specimen. A header in a section is not a banner landmark. */
const Specimen = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label} className='grid gap-2'>
    <span className='font-mono text-label font-medium text-fg-muted uppercase'>{label}</span>
    <div className='overflow-hidden rounded-md border border-line'>{children}</div>
  </section>
)

const field = (id: string, type: FieldDefinition['type']): FieldDefinition => ({ id: `f_${id}`, label: id, type })
const options: ReferenceOption[] = [
  { id: 'e_99969ed3', text: 'Color, Counter · e_99969ed3' },
  { id: 'e_5f0c1d2e', text: 'Switch · e_5f0c1d2e' },
]
const keep = (): Promise<ChangeOutcome> => Promise.resolve({ saved: true })

const accept = (): Promise<RenameOutcome> => Promise.resolve({ saved: true })

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
    <Specimen label='App bar, edit'>
      <AppBar title='Wishem' onRename={accept} initial={{ state: 'edit', draft: 'Wishem studio' }} />
    </Specimen>
    <Specimen label='App bar, saving'>
      <AppBar title='Wishem' onRename={accept} initial={{ state: 'saving', draft: 'Wishem studio' }} />
    </Specimen>
    <Specimen label='App bar, not saved'>
      <AppBar
        title='Wishem'
        onRename={accept}
        initial={{
          state: 'not-saved',
          draft: 'Offline',
          reason: 'The workbench does not run. Start it, and try again.',
        }}
      />
    </Specimen>
    <Specimen label='Zero state'>
      <div className='h-[150px]'>
        <ZeroState label='Workbench' message='Nothing to show yet.' />
      </div>
    </Specimen>
    <Specimen label='Field row, string'>
      <FieldRow field={field('color', 'string')} value='#1d4ed8' onChange={keep} />
    </Specimen>
    <Specimen label='Field row, number'>
      <FieldRow field={field('count', 'number')} value={0} onChange={keep} />
    </Specimen>
    <Specimen label='Field row, boolean'>
      <FieldRow field={field('on', 'boolean')} value onChange={keep} />
    </Specimen>
    <Specimen label='Field row, reference'>
      <FieldRow field={field('target', 'reference')} value='e_5f0c1d2e' options={options} onChange={keep} />
    </Specimen>
    <Specimen label='Field row, no value'>
      <FieldRow field={field('label', 'string')} value={undefined} onChange={keep} />
    </Specimen>
    <Specimen label='Field row, saving'>
      <FieldRow field={field('count', 'number')} value={0} onChange={keep} initial={{ state: 'saving', draft: '7' }} />
    </Specimen>
    <Specimen label='Field row, not saved'>
      <FieldRow
        field={field('count', 'number')}
        value={0}
        onChange={keep}
        initial={{ state: 'not-saved', draft: 'ten', reason: 'Type a number.' }}
      />
    </Specimen>
    <Specimen label='Field row, disabled'>
      <FieldRow field={field('count', 'number')} value={0} />
    </Specimen>
  </Section>
)
