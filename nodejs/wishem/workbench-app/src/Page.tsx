import { Renderer, type InputPort, type PortReader, type ViewTable } from '@thrashplay/wishem-renderer-react'
import { ZeroState } from './components/ZeroState.js'

export interface PageProps {
  /** No value before the first link. */
  port: PortReader | undefined
  /** The port for the inputs of the views. No value before the first link. */
  input: InputPort | undefined
  views: ViewTable
}

/** One column: the pictures of the views, then the zero state in the space that remains. */
export const Page = ({ port, input, views }: PageProps) => (
  <div className='flex h-screen flex-col'>
    {port && <Renderer port={port} input={input} views={views} />}
    <main className='min-h-0 flex-1'>
      <ZeroState label='Workbench' message='Nothing to show yet.' />
    </main>
  </div>
)
