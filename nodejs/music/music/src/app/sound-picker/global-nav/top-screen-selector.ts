import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import type { Drawable } from '../../../ui/drawable.js'
import { translate } from '../../../ui/transform/translate.js'

export const createTopScreenSelector = ({
  numberOfScreens = 1,
  onScreenSelected,
  selectedScreenId = 0,
}: {
  numberOfScreens?: number
  onScreenSelected: (selectedScreenId: number) => void
  selectedScreenId?: number
}): Drawable =>
  group(
    ...Array.from({ length: numberOfScreens }, (_, i) =>
      translate(
        4 + i,
        8,
        createButton({
          color: selectedScreenId === i ? [64, 127, 64] : [32, 32, 32],
          onPress: () => {
            onScreenSelected(i)
          },
        }),
      ),
    ),
  )
