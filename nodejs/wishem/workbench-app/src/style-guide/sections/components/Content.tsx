import { Badge, type BadgeVariant } from '../../../components/Badge.js'
import { Callout, type Status } from '../../../components/Callout.js'
import { Divider } from '../../../components/Divider.js'
import { Quote } from '../../../components/Quote.js'
import { SpiritAside } from '../../../components/SpiritAside.js'
import { Specimen } from '../../Specimen.js'

const callouts: { variant: Status; title: string; text: string }[] = [
  { variant: 'success', title: 'Done.', text: 'The kit passed each run.' },
  { variant: 'warning', title: 'Check this.', text: 'Two runs got stuck in room 3.' },
  { variant: 'danger', title: 'Failed.', text: 'The bat has no kind.' },
  { variant: 'info', title: 'Note.', text: 'A run takes about a minute.' },
]

const badges: { variant: BadgeVariant; text: string }[] = [
  { variant: 'neutral', text: 'Neutral' },
  { variant: 'maker', text: 'Maker' },
  { variant: 'spirit', text: 'Spirit' },
  { variant: 'accent', text: 'Accent' },
  { variant: 'success', text: 'Passed' },
  { variant: 'warning', text: 'Stuck' },
  { variant: 'danger', text: 'Failed' },
  { variant: 'info', text: 'Info' },
]

/**
 * The spirit aside, the quote, the callouts, the badges, and the dividers.
 */
export const Content = () => (
  <div className='grid gap-4'>
    <div className='grid gap-4 min-[900px]:grid-cols-2'>
      <Specimen label='Spirit aside'>
        <div className='p-3' data-testid='spirit-aside'>
          <SpiritAside>This is my favourite trick. A torch makes the bats scatter.</SpiritAside>
        </div>
      </Specimen>
      <Specimen label='Quote with a source'>
        <div className='p-3' data-testid='quote'>
          <Quote cite='rules.md, R7'>A kit is what the first game leaves behind.</Quote>
        </div>
      </Specimen>
    </div>
    <Specimen label='Callouts'>
      <div className='grid gap-3 p-3 min-[900px]:grid-cols-2' data-testid='callouts'>
        {callouts.map(({ variant, title, text }) => (
          <Callout key={variant} variant={variant} title={title}>
            {text}
          </Callout>
        ))}
      </div>
    </Specimen>
    <Specimen label='Badges'>
      <div className='flex flex-wrap gap-2 p-3' data-testid='badges'>
        {badges.map(({ variant, text }) => (
          <Badge key={variant} variant={variant}>
            {text}
          </Badge>
        ))}
      </div>
    </Specimen>
    <Specimen label='Dividers'>
      <div className='grid gap-4 p-3' data-testid='dividers'>
        <div data-testid='divider-plain'>
          <Divider />
        </div>
        <div data-testid='divider-accent'>
          <Divider variant='accent' />
        </div>
      </div>
    </Specimen>
  </div>
)
