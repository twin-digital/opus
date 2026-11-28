import { Renderer, type InputPort, type PortReader, type ViewTable } from '@thrashplay/wishem-renderer-react'
import { ZeroState } from './components/ZeroState.js'
import { ProductTool } from './tools/ProductTool.js'
import type { ProductViews } from './tools/product-views.js'
import { RunTool } from './tools/RunTool.js'
import { usePart } from './tools/use-part.js'
import { useWideLayout } from './use-wide-layout.js'

export interface PageProps {
  /** No value before the first link. */
  port: PortReader | undefined
  /** The port for the inputs of the views. No value before the first link. */
  input: InputPort | undefined
  views: ViewTable
  /** The React views of the product, for the stage. */
  productViews: ProductViews
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

interface ContentProps extends BelowProps {
  productViews: ProductViews
}

/** The product panel, with the run area beside it when the port reads a part `constructs`. */
const Content = ({ port, input, productViews }: ContentProps) => {
  const hasRun = usePart(port, 'constructs') !== undefined
  const wide = useWideLayout()
  if (!hasRun) {
    return (
      <main className='min-h-0 flex-1 overflow-y-auto'>
        <Below port={port} input={input} />
      </main>
    )
  }
  const panel = (
    <div key='panel' className='min-w-0 flex-1 min-[1200px]:overflow-y-auto'>
      <Below port={port} input={input} />
    </div>
  )
  const run = (
    <aside
      key='run'
      aria-label='Run'
      className='shrink-0 border-b border-line p-4 min-[1200px]:w-[672px] min-[1200px]:overflow-y-auto min-[1200px]:border-b-0 min-[1200px]:border-l'
    >
      <RunTool port={port} input={input} productViews={productViews} />
    </aside>
  )
  return (
    <main className='flex min-h-0 flex-1 flex-col overflow-y-auto min-[1200px]:flex-row min-[1200px]:overflow-hidden'>
      {wide ? [panel, run] : [run, panel]}
    </main>
  )
}

/** One column: the pictures of the views, then the main area. */
export const Page = ({ port, input, views, productViews }: PageProps) => (
  <div className='flex h-screen flex-col'>
    {port && <Renderer port={port} input={input} views={views} />}
    {port ?
      <Content port={port} input={input} productViews={productViews} />
    : <main className='min-h-0 flex-1 overflow-y-auto'>
        <ZeroState label='Workbench' message='Nothing to show yet.' />
      </main>
    }
  </div>
)
