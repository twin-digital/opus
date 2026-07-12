import { InstrumentFamilies, type InstrumentFamily } from '../../../midi/instrument-data.js'
import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import { InstrumentFamilyColors } from './colors.js'

export const makeFamilySelector = ({
  onFamilySelected,
  selectedFamily,
}: {
  onFamilySelected: (family: InstrumentFamily) => void
  selectedFamily: InstrumentFamily
}) =>
  group(
    ...InstrumentFamilies.map((family, i) =>
      translate(
        i % 8,
        1 - Math.floor(i / 8),
        createButton({
          color: family.name === selectedFamily.name ? [0, 127, 0] : InstrumentFamilyColors[family.name],
          onPress: () => {
            onFamilySelected(family)
          },
        }),
      ),
    ),
  )
