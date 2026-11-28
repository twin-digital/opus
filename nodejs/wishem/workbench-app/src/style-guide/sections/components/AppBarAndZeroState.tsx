import { AppBar, type RenameOutcome } from '../../../components/AppBar.js'
import { ZeroState } from '../../../components/ZeroState.js'
import { Specimen } from '../../Specimen.js'

const accept = (): Promise<RenameOutcome> => Promise.resolve({ saved: true })

/**
 * The app bar and the zero state.
 */
export const AppBarAndZeroState = () => (
  <>
    <Specimen label='App bar'>
      <AppBar title='Wishem' />
    </Specimen>
    <Specimen label='App bar, long title'>
      <div className='w-[260px]'>
        <AppBar title='A title that is much longer than the bar can show' />
      </div>
    </Specimen>
    <Specimen label='App bar, edit'>
      <AppBar title='Wishem' onRename={accept} initial={{ state: 'edit', draft: 'Wishem studio' }} />
    </Specimen>
    <Specimen label='App bar, saving'>
      <AppBar title='Wishem' onRename={accept} initial={{ state: 'saving', draft: 'Wishem studio' }} />
    </Specimen>
    <Specimen label='App bar, not saved'>
      <AppBar
        title='Wishem'
        onRename={accept}
        initial={{
          state: 'not-saved',
          draft: 'Offline',
          reason: 'The workbench does not run. Start it, and try again.',
        }}
      />
    </Specimen>
    <Specimen label='Zero state'>
      <div className='h-[150px]'>
        <ZeroState label='Workbench' message='Nothing to show yet.' />
      </div>
    </Specimen>
  </>
)
