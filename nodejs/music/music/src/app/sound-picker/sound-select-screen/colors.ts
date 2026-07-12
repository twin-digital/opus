import type { Instrument, InstrumentFamily, InstrumentFamilyName } from '../../../midi/instrument-data.js'
import type { RgbColor } from '../../../ui/color.js'

export const InstrumentFamilyColors = {
  Piano: [96, 0, 127], // Purple — elegance, classical feel
  'Chromatic Percussion': [127, 96, 48], // Sand — reflects metal/wood tones
  Organ: [127, 64, 0], // Burnt Orange — warm, vintage
  Guitar: [0, 127, 127], // Cyan — electric, expressive
  Bass: [64, 127, 96], // Mint Green — rich, low-end
  'Orchestra Solo': [80, 127, 96], // Mint Green (lighter) — lush, orchestral
  'Orchestra Ensemble': [96, 112, 80], // Sage — blended timbres, refined
  Brass: [127, 112, 0], // Gold — bold, commanding
  Reed: [127, 127, 127], // White — breathy, natural
  Wind: [96, 127, 127], // Cool White — airy, pure
  'Synth Lead': [127, 64, 96], // Magenta — bold, cutting edge
  'Synth Pad': [127, 48, 96], // Soft Pink — ambient, warm
  'Synth Sound FX': [127, 32, 64], // Raspberry — experimental, edgy
  Ethnic: [96, 64, 0], // Earthy Brown — traditional, rooted
  Percussive: [127, 96, 64], // Warm Sand — rhythmic, textured
  'Sound Effect': [64, 64, 127], // Steel Blue — abstract, cinematic
  'Drum Kit': [0, 0, 0], // not rendered here
} satisfies Record<InstrumentFamilyName, RgbColor>

export const getInstrumentColor = (family: InstrumentFamily, instrument: Instrument, isSelected: boolean): RgbColor => {
  const familyColor = InstrumentFamilyColors[family.name as InstrumentFamilyName]

  const factors = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
  const factor = factors[instrument.patch - family.firstPatch]
  return isSelected ? [0, 127, 0] : (familyColor.map((c) => Math.round(c * factor)) as RgbColor)
}
