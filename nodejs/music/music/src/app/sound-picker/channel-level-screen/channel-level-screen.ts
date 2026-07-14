import { group } from '../../../ui/components/group.js'
import type { Drawable } from '../../../ui/drawable.js'
import { translate } from '../../../ui/transform/translate.js'
import type { ChannelId, ChannelState } from '../model.js'
import { createChannelControlRow } from './channel-control-row.js'

export const createChannelLevelScreen = ({
  channels,
  onLevelChanged,
  onMuteStatusChanged,
  selectedChannelId,
}: {
  channels: readonly ChannelState[]
  onLevelChanged?: (channelId: ChannelId, level: number) => void
  onMuteStatusChanged?: (channelId: ChannelId, muted: boolean) => void
  selectedChannelId: ChannelId
}): (() => Drawable) => {
  // Rows sit bottom-up at y = channel id, so each row lines up with its channel's pad in the side column — the side
  // pad acts as the row's label.
  const channelControlRows = channels.map((channel) => ({
    row: createChannelControlRow({
      channel,
      onLevelChanged: (level) => {
        onLevelChanged?.(channel.id, level)
      },
      onMuted: (muted) => {
        onMuteStatusChanged?.(channel.id, muted)
      },
      selected: selectedChannelId === channel.id,
    }),
    y: channel.id,
  }))

  return () => group(...channelControlRows.map(({ row, y }) => translate(0, y, row())))
}
