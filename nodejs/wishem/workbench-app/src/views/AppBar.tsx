import { AppBar } from '../components/AppBar.js'
import type { Props } from './AppBar.view.gen.js'

const AppBarView = ({ title }: Props) => <AppBar title={title ?? ''} />

export default AppBarView
