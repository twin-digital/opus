import { useFieldControl } from './Field.js'
import { defined, type Native } from './native.js'
import { textControlClass } from './textControl.js'

export interface TextAreaProps extends Native<'textarea'> {
  /**
   * Puts the text area in the error state.
   */
  invalid?: boolean
}

/**
 * A multi-line text input. A person can drag its height and not its width.
 */
export const TextArea = ({ invalid, id, ...rest }: TextAreaProps) => {
  const control = useFieldControl({ id, invalid, 'aria-describedby': rest['aria-describedby'] })
  return <textarea {...rest} {...defined(control)} className={`${textControlClass} resize-y`} />
}
