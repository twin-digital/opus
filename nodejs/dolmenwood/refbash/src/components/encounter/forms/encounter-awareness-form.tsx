import type { Encounter } from '@twin-digital/dolmenwood/chronicle'
import { Form } from '../../form/form.js'
import { QuickSelectField } from '../../form/quick-select-field.js'
import { observer } from 'mobx-react-lite'

export const EncounterAwarenessForm = observer(({ encounter }: { encounter: Encounter }) => {
  const handleSubmit = (values: Record<string, string | undefined>) => {
    const awareSides = values.awareSides as 'both' | 'none' | 'npcs' | 'players'
    const npcsAware = awareSides === 'both' || awareSides === 'npcs'
    const playersAware = awareSides === 'both' || awareSides === 'players'

    encounter.setAwareness({
      npcs: npcsAware,
      players: playersAware,
    })
  }

  return (
    <Form onSubmit={handleSubmit} submitMode='on-enter'>
      <QuickSelectField
        autoFocus={true}
        defaultValue='both'
        label='Which side(s) have awareness:'
        name='awareSides'
        options={[
          {
            key: 'e',
            label: 'Everybody',
            value: 'both',
          },
          {
            key: 'n',
            label: 'Nobody',
            value: 'none',
          },
          {
            key: 'm',
            label: 'Monsters only',
            value: 'npcs',
          },
          {
            key: 'p',
            label: 'Players only',
            value: 'players',
          },
        ]}
      />
    </Form>
  )
})
