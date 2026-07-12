import type { Instrument, InstrumentFamily } from '../../../midi/instrument-data.js'
import { InstrumentsByFamily } from '../../../midi/instruments.js'
import { createButton } from '../../../ui/components/button.js'
import { group } from '../../../ui/components/group.js'
import { translate } from '../../../ui/transform/translate.js'
import { getInstrumentColor } from './colors.js'

export const makeInstrumentSelector = ({
  instrumentFamily,
  onInstrumentSelected,
  selectedInstrument,
}: {
  instrumentFamily: InstrumentFamily
  onInstrumentSelected: (instrument: Instrument) => void
  selectedInstrument: Instrument
}) => {
  return group(
    ...InstrumentsByFamily[instrumentFamily.name].map((instrument) =>
      translate(
        instrument.patch - instrumentFamily.firstPatch,
        -instrument.bank.lsb,
        createButton({
          color: getInstrumentColor(instrumentFamily, instrument, selectedInstrument.id === instrument.id),
          onPress: () => {
            onInstrumentSelected(instrument)
          },
        }),
      ),
    ),
  )
}
