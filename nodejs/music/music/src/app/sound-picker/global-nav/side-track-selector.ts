import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import type { ChannelState } from '../model.js'

export const createSideTrackSelector = ({
  channels = [],
  onChannelSelected,
  selectedChannelId = 0,
}: {
  channels?: readonly ChannelState[]
  onChannelSelected?: (index: number) => void
  selectedChannelId?: number
}) =>
  group(
    ...channels.map((channel, index) =>
      translate(
        8,
        7 - index,
        createButton({
          color: selectedChannelId === channel.id ? channel.color : [0, 0, 0],
          onPress: () => {
            onChannelSelected?.(channel.id)
          },
        }),
      ),
    ),
  )
