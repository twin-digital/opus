import type { FieldDefinition, Model } from '@thrashplay/wishem-core'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { EntityInspector, type InspectedComponent } from '../../../components/EntityInspector.js'
import { EntityList, type EntityListItem } from '../../../components/EntityList.js'
import { FieldRow, type ChangeOutcome, type ReferenceOption } from '../../../components/FieldRow.js'
import { ProductPanel } from '../../../components/ProductPanel.js'
import { Specimen } from '../../Specimen.js'

const field = (id: string, type: FieldDefinition['type']): FieldDefinition => ({ id: `f_${id}`, label: id, type })
const options: ReferenceOption[] = [
  { id: 'e_99969ed3', text: 'Color, Counter · e_99969ed3' },
  { id: 'e_5f0c1d2e', text: 'Switch · e_5f0c1d2e' },
]
const cardOptions: ReferenceOption[] = [
  { id: 'e_1f2a3b4c', text: 'Deck · e_1f2a3b4c' },
  { id: 'e_2a3b4c5d', text: 'Card · e_2a3b4c5d' },
  { id: 'e_3b4c5d6e', text: 'Card · e_3b4c5d6e' },
  { id: 'e_4c5d6e7f', text: 'Card · e_4c5d6e7f' },
]
const cards = ['e_2a3b4c5d', 'e_3b4c5d6e']
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

/**
 * The entity list, the field row, the inspector, and the product panel.
 */
export const ProductPanelSpecimens = () => (
  <>
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
      <FieldRow field={field('color', 'string')} value='#1d4ed8' onChange={keep} onClear={keep} />
    </Specimen>
    <Specimen label='Field row, number'>
      <FieldRow field={field('count', 'number')} value={0} onChange={keep} onClear={keep} />
    </Specimen>
    <Specimen label='Field row, boolean'>
      <FieldRow field={field('on', 'boolean')} value onChange={keep} onClear={keep} />
    </Specimen>
    <Specimen label='Field row, reference'>
      <FieldRow
        field={field('target', 'reference')}
        value='e_5f0c1d2e'
        options={options}
        onChange={keep}
        onClear={keep}
      />
    </Specimen>
    <Specimen label='Field row, no value'>
      <FieldRow field={field('label', 'string')} value={undefined} onChange={keep} onClear={keep} />
    </Specimen>
    <Specimen label='Field row, saving'>
      <FieldRow
        field={field('count', 'number')}
        value={0}
        onChange={keep}
        onClear={keep}
        initial={{ state: 'saving', draft: '7' }}
      />
    </Specimen>
    <Specimen label='Field row, not saved'>
      <FieldRow
        field={field('count', 'number')}
        value={0}
        onChange={keep}
        onClear={keep}
        initial={{ state: 'not-saved', draft: 'ten', reason: 'Type a number.' }}
      />
    </Specimen>
    <Specimen label='Field row, not cleared'>
      <FieldRow
        field={field('count', 'number')}
        value={0}
        onChange={keep}
        onClear={keep}
        initial={{ state: 'not-cleared', reason: 'The workbench does not run. Start it, and try again.' }}
      />
    </Specimen>
    <Specimen label='Field row, disabled'>
      <FieldRow field={field('count', 'number')} value={0} />
    </Specimen>
    <Specimen label='Field row, reference list'>
      <FieldRow
        field={{ id: 'f_cards', label: 'Cards', type: 'reference-list' }}
        value={cards}
        options={cardOptions}
        onListChange={keep}
        onClear={keep}
      />
    </Specimen>
    <Specimen label='Field row, reference list, empty'>
      <FieldRow
        field={{ id: 'f_cards', label: 'Cards', type: 'reference-list' }}
        value={[]}
        options={cardOptions}
        onListChange={keep}
        onClear={keep}
      />
    </Specimen>
    <Specimen label='Field row, reference list, saving'>
      <FieldRow
        field={{ id: 'f_cards', label: 'Cards', type: 'reference-list' }}
        value={cards}
        options={cardOptions}
        onListChange={keep}
        onClear={keep}
        initial={{ state: 'saving' }}
      />
    </Specimen>
    <Specimen label='Field row, reference list, not saved'>
      <FieldRow
        field={{ id: 'f_cards', label: 'Cards', type: 'reference-list' }}
        value={cards}
        options={cardOptions}
        onListChange={keep}
        onClear={keep}
        initial={{ state: 'not-saved', reason: 'The workbench does not run. Start it, and try again.' }}
      />
    </Specimen>
    <Specimen label='Field row, reference list, disabled'>
      <FieldRow field={{ id: 'f_cards', label: 'Cards', type: 'reference-list' }} value={cards} options={cardOptions} />
    </Specimen>
    <Specimen label='Inspector, nothing selected'>
      <EntityInspector options={options} />
    </Specimen>
    <Specimen label='Inspector, an entity'>
      <EntityInspector
        entity={{ id: SAMPLE_ENTITY, name: 'Color, Counter', components: sampleComponents }}
        options={options}
        onChange={keep}
        onClear={keep}
      />
    </Specimen>
    <Specimen label='Product panel'>
      <div className='w-[720px]'>
        <ProductPanel model={model} selected={SAMPLE_ENTITY} onSelect={select} onChange={keep} onClear={keep} />
      </div>
    </Specimen>
  </>
)
