import { ZeroState } from './components/ZeroState.js'
import { Renderer, type ModelReader, type ViewTable } from './renderer/index.js'

export interface PageProps {
  /** No value before the first link. */
  reader: ModelReader | undefined
  views: ViewTable
}

/** One column: the pictures of the views, then the zero state in the space that remains. */
export const Page = ({ reader, views }: PageProps) => (
  <div className='flex h-screen flex-col'>
    {reader && <Renderer reader={reader} views={views} />}
    <main className='min-h-0 flex-1'>
      <ZeroState label='Workbench' message='Nothing to show yet.' />
    </main>
  </div>
)
