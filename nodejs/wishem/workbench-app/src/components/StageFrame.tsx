import type { ReactNode } from 'react'
import { ZeroState } from './ZeroState.js'

export interface StageFrameProps {
  /** With a value, the zero state with this text, and no picture. */
  message?: string
  /** A second line below the picture, such as the text of a link that is down. */
  note?: string
  children?: ReactNode
}

/** The frame of the picture of the product. The picture gets no color and no font from the frame. */
export const StageFrame = ({ message, note, children }: StageFrameProps) => (
  <section aria-label='Stage' className='min-h-[212px] rounded-sm border border-line bg-ground p-4'>
    {message === undefined ?
      <>
        <div className='font-body text-[initial]'>{children}</div>
        {note !== undefined && <p className='mt-2 text-ui text-fg-muted'>{note}</p>}
      </>
    : <div className='h-[180px]'>
        <ZeroState label='Stage' message={message} />
      </div>
    }
  </section>
)
