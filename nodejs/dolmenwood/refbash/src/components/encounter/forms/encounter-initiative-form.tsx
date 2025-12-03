import type { Encounter } from '@twin-digital/dolmenwood/chronicle'
import { TextField } from '../../form/text-field.js'
import { Panel } from '../../panel.js'
import { validateNumber } from './validate-number.js'
import { Form } from '../../form/form.js'
import { useCallback } from 'react'
import { observer } from 'mobx-react-lite'

export const EncounterInitiativeForm = observer(({ encounter }: { encounter: Encounter }) => {
  const handleSubmit = useCallback(
    (values: Record<string, string | undefined>) => {
      const { playerInitiative, npcInitiativeModifier } = values as {
        playerInitiative: string
        npcInitiativeModifier: string
      }

      encounter.rollInitiative(Number(playerInitiative), {
        npcInitiativeModifier: Number(npcInitiativeModifier),
      })
    },
    [encounter],
  )

  const snapshot = encounter.createSnapshot()
  const npcsSurprised = snapshot.surprise?.npcs?.surprised === true
  const playersSurprised = snapshot.surprise?.players?.surprised === true

  return (
    <Form onSubmit={handleSubmit} submitMode='on-enter'>
      <Panel flexDirection='row' columnGap={2}>
        {!playersSurprised && (
          <TextField
            autoFocus={true}
            label='Player Initiative (1d6):'
            name='playerInitiative'
            validate={validateNumber}
            width={4}
          />
        )}

        {!npcsSurprised && (
          <TextField
            autoFocus={playersSurprised}
            defaultValue={'0'}
            label='NPC Initiative Modifier:'
            name='npcInitiativeModifier'
            validate={validateNumber}
            width={4}
          />
        )}
      </Panel>
    </Form>
  )
})
