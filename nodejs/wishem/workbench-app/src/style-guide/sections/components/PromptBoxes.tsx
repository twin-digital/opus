import { PromptBox } from '../../../components/PromptBox.js'
import { Forced } from '../../Forced.js'
import { Specimen } from '../../Specimen.js'

const noop = () => undefined
const PLACEHOLDER = 'Describe a game, a level or a single mechanic.'
const TEXT = 'make the bats flee when the torch is lit'

/**
 * The prompt box in each state, and in a narrow container.
 */
export const PromptBoxes = () => (
  <div className='grid gap-4 min-[900px]:grid-cols-2'>
    <Specimen label='Prompt box, empty'>
      <div className='p-3' data-testid='prompt-empty'>
        <PromptBox label='Wish' placeholder={PLACEHOLDER} onSend={noop} onStop={noop} />
      </div>
    </Specimen>
    <Specimen label='Prompt box, focus with text'>
      <div className='p-3'>
        <Forced state='focus-within' testId='prompt-focus'>
          <PromptBox label='Wish with text' defaultValue={TEXT} onSend={noop} onStop={noop} />
        </Forced>
      </div>
    </Specimen>
    <Specimen label='Prompt box, working'>
      <div className='p-3' data-testid='prompt-working'>
        <PromptBox label='Wish while working' defaultValue={TEXT} working onSend={noop} onStop={noop} />
      </div>
    </Specimen>
    <Specimen label='Prompt box, disabled'>
      <div className='p-3' data-testid='prompt-disabled'>
        <PromptBox
          label='Wish while disabled'
          placeholder={PLACEHOLDER}
          disabled
          disabledReason='Not connected'
          onSend={noop}
          onStop={noop}
        />
      </div>
    </Specimen>
    <Specimen label='Prompt box, narrow'>
      <div className='w-[260px] p-2' data-testid='prompt-narrow'>
        <PromptBox label='Wish in a narrow box' placeholder={PLACEHOLDER} onSend={noop} onStop={noop} />
      </div>
    </Specimen>
  </div>
)
