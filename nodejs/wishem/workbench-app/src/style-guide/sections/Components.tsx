import { Section } from '../Section.js'
import { AppBarAndZeroState } from './components/AppBarAndZeroState.js'
import { Buttons } from './components/Buttons.js'
import { Content } from './components/Content.js'
import { Controls } from './components/Controls.js'
import { Narrow } from './components/Narrow.js'
import { Panels } from './components/Panels.js'
import { PromptBoxes } from './components/PromptBoxes.js'
import { SelectSpecimens } from './components/SelectSpecimens.js'

/**
 * The components of the workbench, each in each state. One file of `components/` holds each group.
 */
export const Components = () => (
  <Section id='components' title='Components' layout='stacked'>
    <AppBarAndZeroState />
    <Buttons />
    <Controls />
    <SelectSpecimens />
    <PromptBoxes />
    <Panels />
    <Content />
    <Narrow />
  </Section>
)
