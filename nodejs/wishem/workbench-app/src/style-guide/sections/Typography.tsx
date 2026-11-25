import type { ReactNode } from 'react'
import { Section } from '../Section.js'
import { useComputedValue } from '../useComputedValue.js'

const Label = ({ children }: { children: ReactNode }) => (
  <span className='font-mono text-label font-medium text-fg-muted uppercase'>{children}</span>
)

/** A row with a label. A `sized` row adds the computed font size of its specimen to the label. */
const Row = ({ label, sized = false, children }: { label: string; sized?: boolean; children: ReactNode }) => {
  const { ref, value } = useComputedValue(sized ? 'fontSize' : undefined, true)
  const size = value ? ` · ${String(Math.round(parseFloat(value)))}` : ''
  return (
    <>
      <Label>{`${label}${size}`}</Label>
      <div ref={ref} className='min-w-0'>
        {children}
      </div>
    </>
  )
}

const linkClass = 'underline decoration-accent decoration-2 underline-offset-[3px]'

/** The type scale, the typefaces, and the prose elements. */
export const Typography = () => (
  <Section id='typography' title='Typography'>
    <div className='grid grid-cols-[128px_1fr] items-baseline gap-x-4 gap-y-4'>
      <Row label='Heading 1' sized>
        <h1 className='font-display text-h1 font-extrabold'>Say it. Watch it spawn.</h1>
      </Row>
      <Row label='Heading 2' sized>
        <h2 className='font-display text-h2 font-extrabold'>Recordings and reruns</h2>
      </Row>
      <Row label='Heading 3' sized>
        <h3 className='font-display text-h3 font-semibold'>The bats in room 3</h3>
      </Row>
      <Row label='Heading 4' sized>
        <h4 className='font-body text-h4 font-semibold'>Torch behavior</h4>
      </Row>
      <Row label='Lead' sized>
        <p className='text-lead text-fg-muted'>A game engine with a spirit inside.</p>
      </Row>
      <Row label='Body' sized>
        <p className='max-w-[65ch] text-body'>
          Wishem ran your level 40 times overnight. Two runs got stuck behind the gate in room 3, and{' '}
          <a href='#typography-title' className={linkClass}>
            the replays are ready
          </a>
          .
        </p>
      </Row>
      <Row label='UI text' sized>
        <p className='text-ui'>The default size for text in the workbench.</p>
      </Row>
      <Row label='Control' sized>
        <p className='text-control'>Text in a button or a field.</p>
      </Row>
      <Row label='Small' sized>
        <p className='text-small text-fg-muted'>Last run 4 minutes ago.</p>
      </Row>
      <Row label='Mono label' sized>
        <Label>Workbench</Label>
      </Row>
      <Row label='Lists'>
        <div className='grid grid-cols-2 gap-4 text-ui'>
          <ul className='list-disc pl-5'>
            <li>Build</li>
            <li>Test</li>
            <li>Replay</li>
          </ul>
          <ol className='list-decimal pl-5'>
            <li>Say it</li>
            <li>Watch it</li>
            <li>Tune it</li>
          </ol>
        </div>
      </Row>
      <Row label='Code'>
        <div className='grid gap-2 text-ui'>
          <p>
            Inline: <code className='rounded-sm bg-fg/10 px-1 font-mono text-[0.92em] font-medium'>player.ts</code>{' '}
            references a missing sprite.
          </p>
          <pre className='overflow-auto rounded-md border border-line bg-surface p-3 font-mono text-small leading-relaxed'>
            {'onLit(torch) {\n  bats.within(6).forEach(flee)\n}'}
          </pre>
        </div>
      </Row>
      <Row label='Rule'>
        <div className='grid gap-3'>
          <hr className='border-t border-line' />
          <hr className='w-14 border-t-2 border-accent' />
        </div>
      </Row>
    </div>
  </Section>
)
