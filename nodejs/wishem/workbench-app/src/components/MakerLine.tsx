import type { TextProps } from './native.js'

/**
 * One text of the designer, with `> ` before it.
 */
export const MakerLine = ({ children }: TextProps) => (
  <p className='font-mono text-ui break-words text-maker-text'>&gt; {children}</p>
)
