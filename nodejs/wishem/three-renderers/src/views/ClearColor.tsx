import type { ViewTools } from '@thrashplay/wishem-renderer-react'

/** The fields of the component type "Color" of the sample product. */
interface Props {
  /** The field "color". */
  readonly color: string | undefined
  readonly wishem: ViewTools
}

/** Fills the box of the page with the color. Draws nothing when the color has no value. */
const ClearColorView = ({ color }: Props) =>
  color === undefined ? null : <div style={{ position: 'absolute', inset: 0, backgroundColor: color }} />

export default ClearColorView
