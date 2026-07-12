import { createButton } from '../../../ui/components/button.js'
import { createFader } from '../../../ui/components/fader.js'
import { group } from '../../../ui/components/group.js'
import type { Drawable } from '../../../ui/drawable.js'
import { translate } from '../../../ui/transform/translate.js'
import type { ChannelState } from '../model.js'

export const createChannelControlRow = ({
  onLevelChanged,
  onMuted,
  channel,
}: {
  onLevelChanged?: (level: number) => void
  onMuted?: (muted: boolean) => void
  selected?: boolean
  channel: ChannelState
}): (() => Drawable) => {
  const recreateFader = () =>
    createFader({
      length: 7,
      onChange: (value) => {
        currentLevel = value
        onLevelChanged?.(value)
      },
      orientation: 'horizontal',
      value: currentLevel,
      color: currentMuted ? [64, 64, 64] : channel.color,
    })

  let currentMuted = channel.muted
  let currentLevel = channel.level
  let fader = recreateFader()

  return () =>
    group(
      createButton({
        color: currentMuted ? [25, 0, 0] : [0, 25, 0],
        onPress: () => {
          currentMuted = !currentMuted
          onMuted?.(currentMuted)
          fader = recreateFader()
        },
      }),
      translate(1, 0, fader()),
    )
}

export type ChannelControlRowProps = Parameters<typeof createChannelControlRow>[0]
