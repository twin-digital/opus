import type { Encounter, EncounterPhase } from '@twin-digital/dolmenwood'
import { Panel } from '../panel.js'
import { LayerPriority } from '../../input/input-controller.js'
import { observer } from 'mobx-react-lite'
import { useFooter } from '../footer.js'
import { useInputLayer } from '../../input/use-input-layer.js'
import { EncounterStatusTable } from './encounter-status-table.js'
import { StyledText } from '../styled-text.js'
import { EncounterSurpriseForm } from './forms/encounter-surprise-form.js'
import { EncounterAwarenessForm } from './forms/encounter-awareness-form.js'
import { EncounterInitiativeForm } from './forms/encounter-initiative-form.js'

export interface EncounterPanelProps {
  encounter: Encounter

  /**
   * Whether this panel is focused or not.
   */
  focused?: boolean
}

const renderEmptyState = (focused: boolean) => (
  <Panel>
    <StyledText type='bodySecondary'>
      {focused ? 'Select awareness situation.' : "Encounter pending. Press 'e' to begin."}
    </StyledText>
  </Panel>
)

const maybeRenderEncounterDistance = (encounter: Encounter) => {
  const snapshot = encounter.createSnapshot()
  const distanceRange = snapshot.distanceRange
  const rangeText = distanceRange === undefined ? undefined : ` (${distanceRange.min}'-${distanceRange.max}')`

  return (
    snapshot.distance && (
      <Panel flexDirection='row'>
        <StyledText type='label'>&nbsp;&nbsp;Distance: </StyledText>
        <StyledText>{snapshot.distance}'</StyledText>
        {rangeText && <StyledText type='bodySecondary'>{rangeText}</StyledText>}
      </Panel>
    )
  )
}

const formatSideName = (side: 'npcs' | 'players') => {
  switch (side) {
    case 'npcs':
      return 'NPCs'
    case 'players':
      return 'Players'
    default:
      return side
  }
}

const maybeRenderSurprised = (encounter: Encounter) => {
  const snapshot = encounter.createSnapshot()

  const surprisedSides: string[] = []
  if (snapshot.surprise?.npcs?.surprised) {
    surprisedSides.push('NPCs')
  }
  if (snapshot.surprise?.players?.surprised) {
    surprisedSides.push('Players')
  }
  if (surprisedSides.length === 0) {
    surprisedSides.push('Nobody')
  }

  return (
    snapshot.surprise && (
      <Panel flexDirection='row'>
        <StyledText type='label'>&nbsp;Surprised: </StyledText>
        <StyledText>{surprisedSides.join(', ')}</StyledText>
      </Panel>
    )
  )
}

const formatInitiativeWinner = (winner: 'npcs' | 'players' | 'tie') => {
  switch (winner) {
    case 'tie':
      return 'Tie'
    default:
      return formatSideName(winner)
  }
}

const maybeRenderInitiativeWinner = (encounter: Encounter) => {
  const initiativeWinner = encounter.initiativeWinner

  return (
    initiativeWinner && (
      <Panel flexDirection='row'>
        <StyledText type='label'>Initiative: </StyledText>
        <StyledText>{formatInitiativeWinner(initiativeWinner)}</StyledText>
      </Panel>
    )
  )
}

const renderEncounterDetails = (encounter: Encounter) => (
  <>
    <EncounterStatusTable encounter={encounter} marginBottom={1} />

    {maybeRenderEncounterDistance(encounter)}
    {maybeRenderSurprised(encounter)}
    {maybeRenderInitiativeWinner(encounter)}
  </>
)

const renderFooterForm = (phase: EncounterPhase, encounter: Encounter) => {
  switch (phase) {
    case 'new':
      return <EncounterAwarenessForm encounter={encounter} />

    case 'awareness-determined':
      return <EncounterSurpriseForm encounter={encounter} />

    case 'surprise-and-distance-set':
      return <EncounterInitiativeForm encounter={encounter} />

    default:
      return null
  }
}

export const EncounterPanel = observer(({ encounter, focused = false }: EncounterPanelProps) => {
  const phase = encounter.phase

  useInputLayer(
    (layer) => {
      const snapshot = encounter.createSnapshot()

      if (snapshot.initiative) {
        layer.addAction(
          'i',
          () => {
            encounter.resetToPhase('surprise-and-distance-set')
          },
          'initiative reroll',
        )
      }

      if (snapshot.surprise) {
        layer.addAction(
          's',
          () => {
            encounter.resetToPhase('awareness-determined')
          },
          'surprise reroll',
        )
      }

      if (snapshot.awareness) {
        layer.addAction(
          'a',
          () => {
            encounter.resetToPhase('new')
          },
          'awareness change',
        )
      }
    },
    {
      enabled: focused,
      id: 'encounter',
      priority: LayerPriority.Component,
    },
    [encounter, phase],
  )

  useFooter(() => {
    return focused ? renderFooterForm(phase, encounter) : null
  }, [encounter, focused, phase])

  return (
    <Panel flexDirection='column' padding={1} state={focused ? 'current' : undefined} title='Encounter' type='titled'>
      {phase === 'new' ? renderEmptyState(focused) : renderEncounterDetails(encounter)}
    </Panel>
  )
})
