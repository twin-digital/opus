import { Renderer, type InputPort, type PortReader, type ViewTable } from '@thrashplay/wishem-renderer-react'
import { ZeroState } from './components/ZeroState.js'
import { ProductTool } from './tools/ProductTool.js'
import { usePart } from './tools/use-part.js'

export interface PageProps {
  /** No value before the first link. */
  port: PortReader | undefined
  /** The port for the inputs of the views. No value before the first link. */
  input: InputPort | undefined
  views: ViewTable
}

interface BelowProps {
  port: PortReader
  input: InputPort | undefined
}

/** The product panel when the port reads a part `product`, and the zero state when it does not. */
const Below = ({ port, input }: BelowProps) =>
  usePart(port, 'product') === undefined ?
    <ZeroState label='Workbench' message='Nothing to show yet.' />
  : <ProductTool port={port} input={input} />

/** One column: the pictures of the views, then the product panel or the zero state in the space that remains. */
export const Page = ({ port, input, views }: PageProps) => (
  <div className='flex h-screen flex-col'>
    {port && <Renderer port={port} input={input} views={views} />}
    <main className='min-h-0 flex-1 overflow-y-auto'>
      {port ?
        <Below port={port} input={input} />
      : <ZeroState label='Workbench' message='Nothing to show yet.' />}
    </main>
  </div>
)
