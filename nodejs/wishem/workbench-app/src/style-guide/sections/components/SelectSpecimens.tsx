import { Field } from '../../../components/Field.js'
import { Select, type SelectOption } from '../../../components/Select.js'
import { Forced } from '../../Forced.js'
import { Specimen } from '../../Specimen.js'
import { StateMatrix } from '../../StateMatrix.js'

const kinds: SelectOption[] = [
  { value: 'enemy', label: 'Enemy' },
  { value: 'prop', label: 'Prop' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'boss', label: 'Boss (not available)', disabled: true },
]

const narrowOptions: SelectOption[] = [
  { value: 'long-value', label: 'A long value that is longer than the trigger can show' },
  { value: 'long-option', label: 'A long option that wraps onto a second line in the menu' },
]

const noop = () => undefined

/**
 * The select in each state, and the open menu in four cases.
 */
export const SelectSpecimens = () => (
  <>
    <StateMatrix
      columns={['Default', 'Hover', 'Focus', 'Error', 'Disabled']}
      rows={[
        {
          label: 'Select',
          cells: [
            <div key='default' data-testid='select-default'>
              <Select aria-label='Kind' options={kinds} value='enemy' onChange={noop} />
            </div>,
            <Forced key='hover' state='hover' testId='select-hover'>
              <Select aria-label='Kind' options={kinds} value='enemy' onChange={noop} />
            </Forced>,
            <Forced key='focus' state='focus' testId='select-focus'>
              <Select aria-label='Kind' options={kinds} value='enemy' onChange={noop} />
            </Forced>,
            <div key='error' data-testid='select-error'>
              <Field label='Kind' error='Select a kind.'>
                <Select options={kinds} value={undefined} placeholder='Select a kind' onChange={noop} />
              </Field>
            </div>,
            <div key='disabled' data-testid='select-disabled'>
              <Select aria-label='Kind' options={kinds} value='enemy' onChange={noop} disabled />
            </div>,
          ],
        },
      ]}
    />
    <div className='grid gap-4 min-[900px]:grid-cols-3'>
      <Specimen label='Select, open'>
        <div className='h-[200px] w-[200px] p-2' data-testid='select-open'>
          <Select aria-label='Kind' options={kinds} value='enemy' onChange={noop} open />
        </div>
      </Specimen>
      <Specimen label='Select, value not in options'>
        <div className='h-[200px] w-[200px] p-2' data-testid='select-unknown'>
          <Select aria-label='Kind' options={kinds.slice(0, 3)} value='goat' onChange={noop} open />
        </div>
      </Specimen>
      <Specimen label='Select, no options'>
        <div className='h-[200px] w-[200px] p-2' data-testid='select-empty'>
          <Select aria-label='Kind' options={[]} value={undefined} placeholder='Select a kind' onChange={noop} open />
        </div>
      </Specimen>
    </div>
    <Specimen label='Select, narrow'>
      <div className='h-[200px] w-[260px] p-2' data-testid='select-narrow'>
        <Select aria-label='Kind' options={narrowOptions} value='long-value' onChange={noop} open />
      </div>
    </Specimen>
  </>
)
