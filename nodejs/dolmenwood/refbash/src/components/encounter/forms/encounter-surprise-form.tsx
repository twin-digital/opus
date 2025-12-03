import type { Encounter } from '@twin-digital/dolmenwood/chronicle'
import type { D6Result } from '@twin-digital/dolmenwood'
import { Form } from '../../form/form.js'
import { Panel } from '../../panel.js'
import { TextField } from '../../form/text-field.js'
import { validateNumber } from './validate-number.js'
import { observer } from 'mobx-react-lite'
import { useCallback } from 'react'

export const EncounterSurpriseForm = observer(({ encounter }: { encounter: Encounter }) => {
  const handleSubmit = useCallback(
    (values: Record<string, string | undefined>) => {
      const {
        playerSurpriseRoll = 6,
        playerSurpriseChance = 1,
        npcSurpriseChance,
      } = values as {
        playerSurpriseRoll: string | undefined
        playerSurpriseChance: string | undefined
        npcSurpriseChance: string
      }

      encounter.rollSurprise(Number(playerSurpriseRoll), {
        surpriseChance: {
          npcs: Number(npcSurpriseChance) as D6Result,
          players: Number(playerSurpriseChance) as D6Result,
        },
      })
    },
    [encounter],
  )

  const snapshot = encounter.createSnapshot()
  const npcsAware = snapshot.awareness?.npcs === true
  const playersAware = snapshot.awareness?.players === true

  return (
    <Form onSubmit={handleSubmit} submitMode='on-enter'>
      <Panel flexDirection='row' columnGap={2}>
        {!playersAware && (
          <>
            <TextField
              autoFocus={true}
              label='Player Surprise Roll (1d6):'
              name='playerSurpriseRoll'
              validate={validateNumber}
              width={4}
            />
            <TextField
              defaultValue={'2'}
              label='Player Surprise Chance:'
              name='playerSurpriseChance'
              validate={validateNumber}
              width={4}
            />
          </>
        )}
        {!npcsAware && (
          <TextField
            autoFocus={playersAware}
            defaultValue={'2'}
            label='NPC Surprise Chance:'
            name='npcSurpriseChance'
            validate={validateNumber}
            width={4}
          />
        )}
      </Panel>
    </Form>
  )
})
