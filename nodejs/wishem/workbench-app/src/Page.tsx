import { ZeroState } from './components/ZeroState.js'
import { Renderer, type ViewTable } from './renderer/index.js'
import type { CoreReader } from '@thrashplay/wishem-core'

export interface PageProps {
  /** No value before the first snapshot. */
  core: CoreReader | undefined
  views: ViewTable
}

/** One column: the pictures of the views, then the zero state in the space that remains. */
export const Page = ({ core, views }: PageProps) => (
  <div className='flex h-screen flex-col'>
    {core && <Renderer core={core} views={views} />}
    <main className='min-h-0 flex-1'>
      <ZeroState label='Workbench' message='Nothing to show yet.' />
    </main>
  </div>
)
