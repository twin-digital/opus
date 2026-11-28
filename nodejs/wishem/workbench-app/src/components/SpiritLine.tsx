import type { TextProps } from './native.js'

/**
 * One text of Wishem.
 */
export const SpiritLine = ({ children }: TextProps) => (
  <p className='text-ui break-words text-spirit-text'>{children}</p>
)
