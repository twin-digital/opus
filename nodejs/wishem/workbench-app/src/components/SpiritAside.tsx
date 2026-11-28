import type { TextProps } from './native.js'

/**
 * A remark of Wishem. It starts with the signature `Wishem:`.
 */
export const SpiritAside = ({ children }: TextProps) => (
  <div className='rounded-e-md border-s-[3px] border-spirit bg-[color-mix(in_srgb,var(--spirit)_9%,transparent)] px-3.5 py-2 break-words'>
    <b className='font-bold text-spirit-text'>Wishem:</b> {children}
  </div>
)
