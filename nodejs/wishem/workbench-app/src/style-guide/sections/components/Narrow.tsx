import { Button } from '../../../components/Button.js'
import { Callout } from '../../../components/Callout.js'
import { Field } from '../../../components/Field.js'
import { Panel } from '../../../components/Panel.js'
import { Select, type SelectOption } from '../../../components/Select.js'
import { TextInput } from '../../../components/TextInput.js'
import { Specimen } from '../../Specimen.js'

const noop = () => undefined
const kinds: SelectOption[] = [{ value: 'enemy', label: 'Enemy' }]
const LONG_WORD = 'a'.repeat(60)

/**
 * The panel with a form and the callout with a long word, each in a box of 260 pixels.
 */
export const Narrow = () => (
  <div className='grid items-start gap-4 min-[900px]:grid-cols-2'>
    <Specimen label='Panel, narrow'>
      <div className='w-[260px] p-2' data-testid='panel-narrow'>
        <Panel
          title='A long panel title that does not fit the width'
          footer={
            <>
              <Button variant='quiet'>Reset values</Button>
              <Button>Cancel</Button>
              <Button variant='maker'>Apply changes</Button>
            </>
          }
        >
          <Field label='Name'>
            <TextInput defaultValue='Cave bat' />
          </Field>
          <Field label='Kind'>
            <Select options={kinds} value='enemy' onChange={noop} />
          </Field>
        </Panel>
      </div>
    </Specimen>
    <Specimen label='Callout, narrow'>
      <div className='w-[260px] p-2' data-testid='callout-narrow'>
        <Callout variant='warning' title='Check this.'>
          {LONG_WORD}
        </Callout>
      </div>
    </Specimen>
  </div>
)
