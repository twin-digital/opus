import type { ReactNode } from 'react'
import type { Native } from './native.js'

export interface CheckboxProps extends Omit<Native<'input'>, 'type' | 'checked' | 'onChange' | 'children'> {
  checked: boolean
  /**
   * Reports the other value. The box keeps `checked` until the caller gives a new one.
   */
  onChange: (checked: boolean) => void
  /**
   * The label.
   */
  children: ReactNode
}

const boxClass = [
  'relative mt-0.5 size-4 shrink-0 appearance-none rounded-sm border-[1.5px] border-control-border bg-ground',
  'enabled:st-hover:border-fg',
  'checked:border-maker-text checked:bg-maker',
  'checked:enabled:st-hover:border-maker-text checked:enabled:st-hover:brightness-110',
  "checked:after:absolute checked:after:top-px checked:after:left-1 checked:after:h-2 checked:after:w-1 checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-on-fill checked:after:content-['']",
  'st-focus-visible:outline-2 st-focus-visible:outline-offset-2 st-focus-visible:outline-maker-text',
  'disabled:opacity-45',
].join(' ')

/**
 * A native checkbox that the catalog draws, with its label after it. It holds no value.
 */
export const Checkbox = ({ checked, onChange, children, ...rest }: CheckboxProps) => (
  <label className='flex items-start gap-2 text-control break-words'>
    <input
      {...rest}
      type='checkbox'
      checked={checked}
      onChange={(event) => {
        onChange(event.currentTarget.checked)
      }}
      className={boxClass}
    />
    <span className='min-w-0'>{children}</span>
  </label>
)
