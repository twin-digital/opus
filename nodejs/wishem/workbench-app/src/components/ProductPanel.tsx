import type { ClearFieldPayload, Id, Model, SetFieldPayload } from '@thrashplay/wishem-core'
import { entityName, shortId } from './entity-name.js'
import { EntityInspector, type InspectedComponent } from './EntityInspector.js'
import { EntityList } from './EntityList.js'
import type { ChangeOutcome, ReferenceOption } from './FieldRow.js'

export interface ProductPanelProps {
  model: Model
  selected?: Id
  onSelect: (id: Id) => void
  onChange?: (change: SetFieldPayload) => Promise<ChangeOutcome>
  onClear?: (change: ClearFieldPayload) => Promise<ChangeOutcome>
}

/** The entity list and the inspector of a model: two columns from 768 pixels, one column below. */
export const ProductPanel = ({ model, selected, onSelect, onChange, onClear }: ProductPanelProps) => {
  const items = model.entities.map((entity) => ({
    id: entity.id,
    name: entityName(entity, model.definitions),
    shortId: shortId(entity.id),
  }))
  const options: ReferenceOption[] = items.map((item) => ({ id: item.id, text: `${item.name} · ${item.shortId}` }))

  const entity = model.entities.find((candidate) => candidate.id === selected)
  const inspected =
    entity &&
    ({
      id: entity.id,
      name: entityName(entity, model.definitions),
      components: model.definitions.flatMap((definition): InspectedComponent[] => {
        const values = entity.components[definition.id] as InspectedComponent['values'] | undefined
        return values ? [{ definition, values }] : []
      }),
    } satisfies NonNullable<Parameters<typeof EntityInspector>[0]['entity']>)

  return (
    <div className='grid min-h-0 grid-cols-1 bg-surface md:grid-cols-[18rem_minmax(0,1fr)]'>
      <div className='min-w-0 border-b border-line md:border-e md:border-b-0'>
        <EntityList items={items} selected={entity?.id} onSelect={onSelect} />
      </div>
      <EntityInspector
        key={entity?.id}
        entity={inspected}
        options={options}
        onChange={
          onChange &&
          entity &&
          ((componentType, field, value) => onChange({ entity: entity.id, componentType, field, value }))
        }
        onClear={onClear && entity && ((componentType, field) => onClear({ entity: entity.id, componentType, field }))}
      />
    </div>
  )
}
