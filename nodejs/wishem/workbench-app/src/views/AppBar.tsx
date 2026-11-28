import { AppBar } from '../components/AppBar.js'
import type { Props } from './AppBar.view.gen.js'
import { outcomeText } from '../outcome-text.js'

const AppBarView = ({ title, wishem }: Props) => (
  <AppBar
    title={title ?? ''}
    onRename={async (next) => {
      const outcome = await wishem.setField('title', next)
      return outcome.ok ? { saved: true } : { saved: false, reason: outcomeText(outcome) }
    }}
  />
)

export default AppBarView
