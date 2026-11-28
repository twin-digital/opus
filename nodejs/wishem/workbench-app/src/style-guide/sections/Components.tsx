import type { ReactNode } from 'react'
import type { FieldDefinition, Model } from '@thrashplay/wishem-core'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { AppBar, type RenameOutcome } from '../../components/AppBar.js'
import { EntityInspector, type InspectedComponent } from '../../components/EntityInspector.js'
import { EntityList, type EntityListItem } from '../../components/EntityList.js'
import { FieldRow, type ChangeOutcome, type ReferenceOption } from '../../components/FieldRow.js'
import { ProductPanel } from '../../components/ProductPanel.js'
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

const SWITCH_TYPE = 'ct_3c1b7a52-0d4e-4f6a-9b8c-5e2d1f0a9c77'
const TARGET_FIELD = 'fld_8a2f6d14-7b3c-4e90-a1d5-6c4b2e0f9d38'
const SWITCH_ENTITY = 'e_5f0c1d2e-8b7a-4c63-9d14-2a6e0b3f7c91'

const colorType = {
  id: COLOR_TYPE,
  label: 'Color',
  fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }],
} satisfies Model['definitions'][number]
const counterType = {
  id: COUNTER_TYPE,
  label: 'Counter',
  fields: [{ id: COUNT_FIELD, label: 'count', type: 'number' }],
} satisfies Model['definitions'][number]
const switchType = {
  id: SWITCH_TYPE,
  label: 'Switch',
  fields: [{ id: TARGET_FIELD, label: 'target', type: 'reference' }],
} satisfies Model['definitions'][number]

const model: Model = {
  definitions: [colorType, counterType, switchType],
  entities: [
    {
      id: SAMPLE_ENTITY,
      components: { [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' }, [COUNTER_TYPE]: { [COUNT_FIELD]: 0 } },
    },
    { id: SWITCH_ENTITY, components: { [SWITCH_TYPE]: { [TARGET_FIELD]: SAMPLE_ENTITY } } },
  ],
}
const listItems: EntityListItem[] = [
  { id: SAMPLE_ENTITY, name: 'Color, Counter', shortId: 'e_99969ed3' },
  { id: SWITCH_ENTITY, name: 'Switch', shortId: 'e_5f0c1d2e' },
]
const sampleComponents: InspectedComponent[] = [
  { definition: colorType, values: { [COLOR_FIELD]: '#1d4ed8' } },
  { definition: counterType, values: { [COUNT_FIELD]: 0 } },
]
const select = (): void => undefined

const accept = (): Promise<RenameOutcome> => Promise.resolve({ saved: true })

/** The components of the workbench, each in each state. */
export const Components = () => (
  <Section id='components' title='Components' stacked>
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
    <Specimen label='Entity list'>
      <div className='w-[288px]'>
        <EntityList items={listItems} onSelect={select} />
      </div>
    </Specimen>
    <Specimen label='Entity list, selected'>
      <div className='w-[288px]'>
        <EntityList items={listItems} selected={SWITCH_ENTITY} onSelect={select} />
      </div>
    </Specimen>
    <Specimen label='Entity list, empty'>
      <div className='w-[288px]'>
        <EntityList items={[]} onSelect={select} />
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
    <Specimen label='Inspector, nothing selected'>
      <EntityInspector options={options} />
    </Specimen>
    <Specimen label='Inspector, an entity'>
      <EntityInspector
        entity={{ id: SAMPLE_ENTITY, name: 'Color, Counter', components: sampleComponents }}
        options={options}
        onChange={keep}
      />
    </Specimen>
    <Specimen label='Product panel'>
      <div className='w-[720px]'>
        <ProductPanel model={model} selected={SAMPLE_ENTITY} onSelect={select} onChange={keep} />
      </div>
    </Specimen>
  </Section>
)
