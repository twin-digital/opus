import type { Delve } from '@twin-digital/dolmenwood'
import { observer } from 'mobx-react-lite'
import { CompactTable } from '../table/compact-table.js'
import { Panel } from '../panel.js'

interface Props {
  /**
   * Delve for which light sources should be displayed.
   */
  delve: Delve

  /**
   * Whether this table is currently focused or not.
   */
  focused?: boolean
}

export const LightSourcesTable = observer(({ delve, focused, ...rest }: Props) => {
  return (
    <Panel flexDirection='column' state={focused ? 'current' : undefined} title='Lights' type='titled'>
      <CompactTable
        columns={[
          {
            property: 'carriedBy',
            style: {
              flexGrow: 1,
            },
            title: 'Character',
          },
          {
            property: 'type',
            title: 'Type',
          },
          {
            justify: 'center',
            property: 'turnsRemaining',
            title: 'Turns',
          },
        ]}
        data={delve.activeLightSources}
        emptyContent='There are no active light sources.'
        {...rest}
      />
    </Panel>
  )
})
