import { useFieldControl } from './Field.js'
import { defined, type Native } from './native.js'
import { textControlClass } from './textControl.js'

export interface TextInputProps extends Native<'input'> {
  /**
   * Puts the input in the error state.
   */
  invalid?: boolean
}

/**
 * A single-line text input. It shows the `value` of the caller, or holds its own text from `defaultValue`.
 */
export const TextInput = ({ invalid, id, ...rest }: TextInputProps) => {
  const control = useFieldControl({ id, invalid, 'aria-describedby': rest['aria-describedby'] })
  return <input {...rest} {...defined(control)} className={textControlClass} />
}
