import { AppBar } from '../../../components/AppBar.js'
import { ZeroState } from '../../../components/ZeroState.js'
import { Specimen } from '../../Specimen.js'

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
    <Specimen label='Zero state'>
      <div className='h-[150px]'>
        <ZeroState label='Workbench' message='Nothing to show yet.' />
      </div>
    </Specimen>
  </>
)
