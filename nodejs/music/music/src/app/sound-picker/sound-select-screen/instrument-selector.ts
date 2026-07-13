import type { Instrument, InstrumentFamily, InstrumentFamilyName } from '../../../midi/instrument-data.js'
import { InstrumentsByFamily } from '../../../midi/instruments.js'
import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import { getInstrumentColor } from './colors.js'

/**
 * Families laid out by packing instruments in data order — left-to-right, filling rows downward — instead of the
 * default variation layout (column = patch offset, row = bank LSB). Used when the variation layout scatters
 * instruments off the grid: Drum Kit patch numbers are sparse, and Sound Effect variations run deeper than the
 * 5-row instrument area.
 */
const PackedLayoutFamilies: InstrumentFamilyName[] = ['Drum Kit', 'Sound Effect']

/**
 * Instruments excluded from the picker. Sound Effect has 41 instruments but the packed layout has 40 slots, so
 * Burst Noise is dropped: a layout bug in the initial version never displayed it anyway, and it won't be missed.
 */
const HiddenInstrumentIds = ['125#121#9']

/**
 * Grid position of an instrument's button, relative to the top-left cell of the instrument area. `index` is the
 * instrument's position within the family's (sorted) instrument list.
 */
const getPosition = (family: InstrumentFamily, instrument: Instrument, index: number) =>
  PackedLayoutFamilies.includes(family.name as InstrumentFamilyName) ?
    { x: index % 8, y: -Math.floor(index / 8) }
  : { x: instrument.patch - family.firstPatch, y: -instrument.bank.lsb }

export const makeInstrumentSelector = ({
  instrumentFamily,
  onInstrumentSelected,
  selectedInstrument,
}: {
  instrumentFamily: InstrumentFamily
  onInstrumentSelected: (instrument: Instrument) => void
  selectedInstrument: Instrument
}) => {
  const instruments = InstrumentsByFamily[instrumentFamily.name].filter(
    (instrument) => !HiddenInstrumentIds.includes(instrument.id),
  )

  return group(
    ...instruments.map((instrument, index) => {
      const { x, y } = getPosition(instrumentFamily, instrument, index)
      return translate(
        x,
        y,
        createButton({
          color: getInstrumentColor(instrumentFamily, x, selectedInstrument.id === instrument.id),
          onPress: () => {
            onInstrumentSelected(instrument)
          },
        }),
      )
    }),
  )
}
