import { InstrumentFamilies, type Instrument, type InstrumentFamily } from '../../../midi/instrument-data.js'
import { InstrumentsByFamily } from '../../../midi/instruments.js'
import { group } from '../../../ui/components/group.js'
import type { Drawable } from '../../../ui/drawable.js'
import { translate } from '../../../ui/transform/translate.js'
import { makeFamilySelector } from './family-selector.js'
import { makeInstrumentSelector } from './instrument-selector.js'

export const createSoundSelectScreen = ({
  onFamilySelected,
  onInstrumentSelected,
  selectedFamily = InstrumentFamilies[0],
  selectedInstrument,
}: {
  onFamilySelected?: (family: InstrumentFamily) => void
  onInstrumentSelected?: (instrument: Instrument) => void
  selectedFamily?: InstrumentFamily
  selectedInstrument?: Instrument
} = {}): (() => Drawable) => {
  let currentSelectedFamily = selectedFamily
  let currentSelectedInstrument = selectedInstrument ?? InstrumentsByFamily[currentSelectedFamily.name][0]

  const selectFamily = (family: InstrumentFamily) => {
    if (family.index !== currentSelectedFamily.index) {
      currentSelectedFamily = family
      onFamilySelected?.(family)
      selectInstrument(InstrumentsByFamily[family.name][0])
      console.log('Selected family: ', family.name)
    }
  }

  const selectInstrument = (instrument: Instrument) => {
    if (instrument.id !== currentSelectedInstrument.id) {
      onInstrumentSelected?.(instrument)
      currentSelectedInstrument = instrument
      console.log(`Selected instrument: ${instrument.name}`)
    }
  }

  // The family selector occupies the top three rows (7-5); the instrument area fills the five rows below (4-0).
  return () =>
    group(
      translate(
        0,
        6,
        makeFamilySelector({
          onFamilySelected: selectFamily,
          selectedFamily: currentSelectedFamily,
        }),
      ),
      translate(
        0,
        4,
        makeInstrumentSelector({
          instrumentFamily: currentSelectedFamily,
          onInstrumentSelected: selectInstrument,
          selectedInstrument: currentSelectedInstrument,
        }),
      ),
    )
}
