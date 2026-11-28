import type { ComponentTypeDefinition, FieldValue, Id } from '@thrashplay/wishem-core'
import { FieldRow, type ChangeOutcome, type ReferenceOption } from './FieldRow.js'
import { ZeroState } from './ZeroState.js'

export interface InspectedComponent {
  definition: ComponentTypeDefinition
  values: Readonly<Record<Id, FieldValue>>
}

export interface EntityInspectorProps {
  /** With no value: the zero state "Select an entity to change it." */
  entity?: { id: Id; name: string; components: readonly InspectedComponent[] }
  options: readonly ReferenceOption[]
  onChange?: (componentType: Id, field: Id, value: FieldValue) => Promise<ChangeOutcome>
}

/** The name and the ID of an entity, and one group of field rows for each of its components. */
export const EntityInspector = ({ entity, options, onChange }: EntityInspectorProps) => {
  if (!entity) {
    return (
      <div className='h-32'>
        <ZeroState label='Inspector' message='Select an entity to change it.' />
      </div>
    )
  }
  return (
    <section aria-label={entity.name} className='min-w-0'>
      <div className='grid gap-0.5 px-4 py-3'>
        <h2 className='text-ui font-semibold text-fg'>{entity.name}</h2>
        <p className='font-mono text-label font-medium break-all text-fg-muted uppercase'>{entity.id}</p>
      </div>
      {entity.components.map(({ definition, values }) => (
        <fieldset key={definition.id} className='min-w-0 pb-2'>
          <legend className='px-4 py-2 text-ui font-semibold text-fg'>{definition.label}</legend>
          {definition.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={values[field.id]}
              options={options}
              onChange={onChange && ((value) => onChange(definition.id, field.id, value))}
            />
          ))}
        </fieldset>
      ))}
    </section>
  )
}
