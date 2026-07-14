import { group } from '../../../ui/components/group.js'
import type { Drawable } from '../../../ui/drawable.js'
import { translate } from '../../../ui/transform/translate.js'
import type { Channel } from '../channel.js'
import type { ChannelId } from '../model.js'
import { createChannelControlRow } from './channel-control-row.js'

export const createChannelLevelScreen = ({
  channels,
  onLevelChanged,
  onMuteStatusChanged,
  selectedChannelId,
}: {
  channels: Readonly<Channel>[]
  onLevelChanged?: (channelId: ChannelId, level: number) => void
  onMuteStatusChanged?: (channelId: ChannelId, muted: boolean) => void
  selectedChannelId: ChannelId
}): (() => Drawable) => {
  const channelControlRows = channels.map((channel) =>
    createChannelControlRow({
      channel,
      onLevelChanged: (level) => {
        onLevelChanged?.(channel.id, level)
      },
      onMuted: (muted) => {
        onMuteStatusChanged?.(channel.id, muted)
      },
      selected: selectedChannelId === channel.id,
    }),
  )

  return () =>
    group(...channelControlRows.map((channelControls, index) => group(translate(0, 7 - index, channelControls()))))
}
