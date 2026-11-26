import type { ReactNode } from 'react'
import { Checkbox } from '../../../components/Checkbox.js'
import { Field } from '../../../components/Field.js'
import { TextArea } from '../../../components/TextArea.js'
import { TextInput } from '../../../components/TextInput.js'
import { Forced } from '../../Forced.js'
import { Specimen } from '../../Specimen.js'
import { StateMatrix } from '../../StateMatrix.js'

const noop = () => undefined

const textColumns = ['Default', 'Hover', 'Focus', 'Error', 'Disabled', 'Read-only']

interface TextRow {
  id: string
  label: string
  /**
   * Draws the control with a name for a screen reader.
   */
  draw: (props: { disabled?: boolean; readOnly?: boolean }) => ReactNode
  errorMessage: string
  fieldLabel: string
  /**
   * Draws the control of the error cell, which a field names.
   */
  drawInField: () => ReactNode
  readOnly: boolean
}

const textRows: TextRow[] = [
  {
    id: 'text-input',
    label: 'Text input',
    draw: (props) => <TextInput aria-label='Name' defaultValue='Cave bat' {...props} />,
    errorMessage: 'Enter a number.',
    fieldLabel: 'Speed',
    drawInField: () => <TextInput defaultValue='fast' />,
    readOnly: true,
  },
  {
    id: 'text-input-empty',
    label: 'Empty input',
    draw: (props) => <TextInput aria-label='Name' placeholder='Name' {...props} />,
    errorMessage: 'A name is required.',
    fieldLabel: 'Name',
    drawInField: () => <TextInput placeholder='Name' />,
    readOnly: false,
  },
  {
    id: 'text-area',
    label: 'Text area',
    draw: (props) => <TextArea aria-label='Behaviour' rows={2} defaultValue='Flees when a torch is lit.' {...props} />,
    errorMessage: 'Describe the behaviour.',
    fieldLabel: 'Behaviour',
    drawInField: () => <TextArea rows={2} />,
    readOnly: true,
  },
]

const checkboxColumns = ['Default', 'Hover', 'Focus', 'Disabled']

/**
 * The text input, the text area, and the checkbox in each state.
 */
export const Controls = () => (
  <>
    <StateMatrix
      columns={textColumns}
      rows={textRows.map((row) => ({
        label: row.label,
        cells: [
          <div key='default' data-testid={`${row.id}-default`}>
            {row.draw({})}
          </div>,
          <Forced key='hover' state='hover' testId={`${row.id}-hover`}>
            {row.draw({})}
          </Forced>,
          <Forced key='focus' state='focus' testId={`${row.id}-focus`}>
            {row.draw({})}
          </Forced>,
          <div key='error' data-testid={`${row.id}-error`}>
            <Field label={row.fieldLabel} error={row.errorMessage}>
              {row.drawInField()}
            </Field>
          </div>,
          <div key='disabled' data-testid={`${row.id}-disabled`}>
            {row.draw({ disabled: true })}
          </div>,
          row.readOnly ?
            <div key='read-only' data-testid={`${row.id}-read-only`}>
              {row.draw({ readOnly: true })}
            </div>
          : null,
        ],
      }))}
    />
    <div className='grid gap-4 min-[900px]:grid-cols-3'>
      <Specimen label='Error with focus'>
        <div className='w-[190px] p-2'>
          <Forced state='focus' testId='text-input-error-focus'>
            <Field label='Speed' error='Enter a number.'>
              <TextInput defaultValue='fast' />
            </Field>
          </Forced>
        </div>
      </Specimen>
    </div>
    <StateMatrix
      columns={checkboxColumns}
      rows={[false, true].map((checked) => {
        const name = checked ? 'on' : 'off'
        return {
          label: checked ? 'Checkbox, on' : 'Checkbox, off',
          cells: [
            <div key='default' data-testid={`checkbox-${name}-default`}>
              <Checkbox checked={checked} onChange={noop}>
                Flees light
              </Checkbox>
            </div>,
            <Forced key='hover' state='hover' testId={`checkbox-${name}-hover`}>
              <Checkbox checked={checked} onChange={noop}>
                Flees light
              </Checkbox>
            </Forced>,
            <Forced key='focus' state='focus' testId={`checkbox-${name}-focus`}>
              <Checkbox checked={checked} onChange={noop}>
                Flees light
              </Checkbox>
            </Forced>,
            <div key='disabled' data-testid={`checkbox-${name}-disabled`}>
              <Checkbox checked={checked} onChange={noop} disabled>
                Flees light
              </Checkbox>
            </div>,
          ],
        }
      })}
    />
    <Specimen label='Checkbox, long label'>
      <div className='w-[260px] p-2' data-testid='checkbox-long'>
        <Checkbox checked onChange={noop}>
          Flees from any light source that is brighter than a candle, including a torch that is carried by a person
        </Checkbox>
      </div>
    </Specimen>
  </>
)
