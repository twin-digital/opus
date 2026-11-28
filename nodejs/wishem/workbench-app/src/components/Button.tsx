import type { Native } from './native.js'
import { Spinner } from './Spinner.js'

export type ButtonVariant = 'maker' | 'neutral' | 'quiet' | 'danger'

export interface ButtonProps extends Native<'button'> {
  /**
   * Default: `neutral`.
   */
  variant?: ButtonVariant
  /**
   * Shows a spinner and ignores clicks. The button stays in the focus order.
   */
  loading?: boolean
  /**
   * Dims the button and ignores clicks, Enter, and Space. The button keeps the focus and its place in the tab order.
   */
  disabled?: boolean
  /**
   * The accessible name. It starts with the label. Default: the label.
   */
  accessibleName?: string
}

const baseClass = [
  'inline-flex items-center justify-center rounded-sm border border-transparent px-3 py-1.5 text-control font-medium whitespace-nowrap',
  'st-focus-visible:outline-2 st-focus-visible:outline-offset-2 st-focus-visible:outline-maker-text',
].join(' ')

const neutralFill = [
  'st-hover:bg-[color-mix(in_srgb,var(--fg)_8%,var(--surface))]',
  'st-active:translate-y-px st-active:bg-[color-mix(in_srgb,var(--fg)_14%,var(--surface))]',
].join(' ')

const variantClass: Record<ButtonVariant, { look: string; states: string }> = {
  maker: {
    look: 'bg-maker font-semibold text-on-fill',
    states: 'st-hover:brightness-[1.08] st-active:translate-y-px st-active:brightness-[0.88]',
  },
  neutral: { look: 'border-control-border bg-surface text-fg', states: neutralFill },
  quiet: { look: 'text-fg-muted', states: neutralFill },
  danger: {
    look: 'bg-danger font-semibold text-on-fill',
    states: 'st-hover:brightness-[1.08] st-active:translate-y-px st-active:brightness-[0.96]',
  },
}

const stateClass = (variant: ButtonVariant, loading: boolean, disabled: boolean) => {
  if (loading) {
    return 'cursor-progress'
  }
  if (disabled) {
    return 'cursor-not-allowed opacity-45'
  }
  return `cursor-pointer ${variantClass[variant].states}`
}

/**
 * A button drawn by the catalog. It does not submit a form unless the caller sets `type`.
 */
export const Button = ({
  variant = 'neutral',
  loading = false,
  disabled = false,
  accessibleName,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    type={type}
    aria-label={accessibleName ?? rest['aria-label']}
    aria-busy={loading ? true : rest['aria-busy']}
    aria-disabled={loading || disabled ? true : rest['aria-disabled']}
    data-loading={loading ? '' : undefined}
    data-disabled={disabled ? '' : undefined}
    onClick={(event) => {
      if (loading || disabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }}
    className={`${baseClass} ${variantClass[variant].look} ${stateClass(variant, loading, disabled)}`}
  >
    {loading && <Spinner />}
    {children}
  </button>
)
