import { Badge } from '../../../components/Badge.js'
import { Button } from '../../../components/Button.js'
import { Checkbox } from '../../../components/Checkbox.js'
import { Field } from '../../../components/Field.js'
import { MakerLine } from '../../../components/MakerLine.js'
import { Panel } from '../../../components/Panel.js'
import { Select, type SelectOption } from '../../../components/Select.js'
import { SpiritLine } from '../../../components/SpiritLine.js'
import { TextInput } from '../../../components/TextInput.js'
import { Specimen } from '../../Specimen.js'

const noop = () => undefined

const kinds: SelectOption[] = [
  { value: 'enemy', label: 'Enemy' },
  { value: 'prop', label: 'Prop' },
]

/**
 * The panel with a header, a form and a footer, the plain panel, the panel with a body only, and the panel with the
 * maker line and the spirit line.
 */
export const Panels = () => (
  <div className='grid items-start gap-4 min-[900px]:grid-cols-2'>
    <Specimen label='Panel with a header and a footer'>
      <div className='p-3' data-testid='panel-full'>
        <Panel
          title='Cave bat'
          headerEnd={<Badge variant='accent'>Draft</Badge>}
          footer={
            <>
              <Button variant='quiet'>Reset</Button>
              <Button variant='maker'>Apply</Button>
            </>
          }
        >
          <Field label='Name'>
            <TextInput defaultValue='Cave bat' />
          </Field>
          <Field label='Kind'>
            <Select options={kinds} value='enemy' onChange={noop} />
          </Field>
          <Field label='Speed' error='Enter a number.'>
            <TextInput defaultValue='fast' />
          </Field>
          <Checkbox checked onChange={noop}>
            Flees light
          </Checkbox>
        </Panel>
      </div>
    </Specimen>
    <div className='grid gap-4'>
      <Specimen label='Panel, plain'>
        <div className='p-3' data-testid='panel-plain'>
          <Panel>The header and the footer show only when the panel has content for them.</Panel>
        </div>
      </Specimen>
      <Specimen label='Panel, body only'>
        <div className='p-3' data-testid='panel-body'>
          <Panel>
            <p>One line of text.</p>
          </Panel>
        </div>
      </Specimen>
      <Specimen label='Maker line and spirit line in a panel'>
        <div className='p-3' data-testid='panel-lines'>
          <Panel title='Replay'>
            <MakerLine>make the bats flee when the torch is lit</MakerLine>
            <SpiritLine>Done. Bats now scatter when a torch is lit.</SpiritLine>
          </Panel>
        </div>
      </Specimen>
    </div>
  </div>
)
