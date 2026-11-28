import type { FieldValue } from '@thrashplay/wishem-core'
import type { ViewTools } from '@thrashplay/wishem-renderer-react'

/** The fields of the component type "Color" of the sample product. */
interface Props {
  /** The field "color". */
  readonly color: FieldValue | undefined
  readonly wishem: ViewTools
}

const isColor = (value: FieldValue | undefined): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** Fills the box of the page with the color. Fills it with `#ff00ff` when the color is missing or is not `#rrggbb`. */
const ClearColorView = ({ color }: Props) => (
  <div style={{ position: 'absolute', inset: 0, backgroundColor: isColor(color) ? color.toLowerCase() : '#ff00ff' }} />
)

export default ClearColorView
