import { Section } from '../Section.js'
import { AppBarAndZeroState } from './components/AppBarAndZeroState.js'
import { SelectSpecimens } from './components/SelectSpecimens.js'

/**
 * The components of the workbench, each in each state. One file of `components/` holds each group.
 */
export const Components = () => (
  <Section id='components' title='Components' layout='stacked'>
    <AppBarAndZeroState />
    <SelectSpecimens />
  </Section>
)
