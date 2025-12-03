import type { Encounter } from '@twin-digital/dolmenwood/chronicle'
import { CompactTable, type ColumnDefinition } from '../table/compact-table.js'
import { Panel } from '../panel.js'
import type { LayoutProps } from '../../theme/ink.js'

export interface EncounterStatusTableProps extends LayoutProps {
  /**
   * Encounter for which status should be rendered.
   */
  encounter: Encounter
}

const yesOrNo = (value?: boolean): string =>
  value === undefined ? '-'
  : value ? 'Yes'
  : 'No'

const formatSurprisedColumn = (surprise?: null | { readonly roll: number; readonly surprised: boolean }) =>
  surprise ? `${yesOrNo(surprise.surprised)} (${surprise.roll})` : '-'

const formatInitiativeColumn = (initiative?: number | 'automatic' | 'surprised') => {
  if (initiative === undefined) {
    return '-'
  }

  switch (initiative) {
    case 'automatic':
      return 'WIN'
    case 'surprised':
      return '-'
    default:
      return `${initiative}`
  }
}

export const EncounterStatusTable = ({ encounter, ...layoutProps }: EncounterStatusTableProps) => {
  const columns: (string | ColumnDefinition)[] = [
    {
      property: 'Side',
    },
  ]

  const snapshot = encounter.createSnapshot()
  if (snapshot.awareness !== undefined) {
    columns.push({
      justify: 'center',
      property: 'Aware',
    })
  }

  if (snapshot.surprise !== undefined) {
    columns.push({
      justify: 'center',
      property: 'Surprise Chance',
      title: 'Surp Chance',
    })
  }

  if (snapshot.surprise !== undefined) {
    columns.push({
      justify: 'center',
      property: 'Surprised',
    })
  }

  if (snapshot.initiative !== undefined) {
    columns.push({
      justify: 'center',
      property: 'Initiative',
      title: 'Init',
    })
  }

  const data = [
    {
      Side: 'NPCs',
      Aware: yesOrNo(snapshot.awareness?.npcs),
      Initiative: formatInitiativeColumn(snapshot.initiative?.npcs),
      'Surprise Chance': snapshot.surprise?.npcs?.chance ?? '-',
      Surprised: formatSurprisedColumn(snapshot.surprise?.npcs),
    },
    {
      Side: 'Players',
      Aware: yesOrNo(snapshot.awareness?.players),
      Initiative: formatInitiativeColumn(snapshot.initiative?.players),
      'Surprise Chance': snapshot.surprise?.players?.chance ?? '-',
      Surprised: formatSurprisedColumn(snapshot.surprise?.players),
    },
  ]

  return (
    <Panel {...layoutProps}>
      <CompactTable columns={columns} data={data} />
    </Panel>
  )
}
