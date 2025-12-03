import type { ActiveLightSource, Delve } from '@twin-digital/dolmenwood'
import { observer } from 'mobx-react-lite'
import { CompactTable } from '../table/compact-table.js'
import { Panel } from '../panel.js'
import { useTheme } from '../../store/hooks.js'
import { useCallback, useState } from 'react'
import { LayerPriority } from '../../input/input-controller.js'
import { useInputLayer } from '../../input/use-input-layer.js'
import { useFooter } from '../footer.js'
import { AddLightSourceForm } from './add-light-source-form.js'

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
  const theme = useTheme()

  const [mode, setMode] = useState<'default' | 'add'>('default')
  const [selectedLight, setSelectedLight] = useState<number | null>(null)

  const deleteSelectedLight = useCallback(() => {
    if (selectedLight !== null) {
      delve.deleteLightSource(selectedLight)
    }
  }, [selectedLight])

  useInputLayer(
    (layer) => {
      layer.addAction(
        'a',
        () => {
          setMode('add')
        },
        'add light',
      )

      layer.addAction(
        'd',
        () => {
          deleteSelectedLight()
        },
        'delete light',
      )

      if (mode !== 'default') {
        layer.addAction(
          {
            key: 'escape',
          },
          () => {
            setMode('default')
          },
          'cancel',
        )
      }
    },
    {
      enabled: focused,
      priority: LayerPriority.Component,
    },
    [deleteSelectedLight, mode, setMode],
  )

  useFooter(() => {
    return focused && mode === 'add' ?
        <AddLightSourceForm
          onCancel={() => {
            setMode('default')
          }}
          onSubmit={(light) => {
            delve.addLightSource(light)
            setMode('default')
          }}
        />
      : null
  }, [delve, setMode])

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
        getRowStyle={(_, data) => {
          const light = data as ActiveLightSource

          if (light.turnsRemaining < 1) {
            return {
              color: theme.state.error.medium,
            }
          }

          if (light.turnsRemaining < 2) {
            return {
              color: theme.state.warning.medium,
            }
          }

          return undefined
        }}
        onSelectRow={
          focused ?
            (_, light) => {
              setSelectedLight((light as ActiveLightSource).iid)
            }
          : undefined
        }
        {...rest}
      />
    </Panel>
  )
})
