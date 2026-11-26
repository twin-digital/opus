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
}

const baseClass = [
  'inline-flex items-center justify-center rounded-sm border border-transparent px-3 py-1.5 text-control font-medium whitespace-nowrap',
  'cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 data-loading:cursor-progress',
  'st-focus-visible:outline-2 st-focus-visible:outline-offset-2 st-focus-visible:outline-maker-text',
].join(' ')

const neutralFill = [
  'enabled:not-data-loading:st-hover:bg-[color-mix(in_srgb,var(--fg)_8%,var(--surface))]',
  'enabled:not-data-loading:st-active:translate-y-px enabled:not-data-loading:st-active:bg-[color-mix(in_srgb,var(--fg)_14%,var(--surface))]',
].join(' ')

const variantClass: Record<ButtonVariant, string> = {
  maker: [
    'bg-maker font-semibold text-on-fill',
    'enabled:not-data-loading:st-hover:brightness-[1.08]',
    'enabled:not-data-loading:st-active:translate-y-px enabled:not-data-loading:st-active:brightness-[0.88]',
  ].join(' '),
  neutral: `border-control-border bg-surface text-fg ${neutralFill}`,
  quiet: `text-fg-muted ${neutralFill}`,
  danger: [
    'bg-danger font-semibold text-on-fill',
    'enabled:not-data-loading:st-hover:brightness-[1.08]',
    'enabled:not-data-loading:st-active:translate-y-px enabled:not-data-loading:st-active:brightness-[0.96]',
  ].join(' '),
}

/**
 * A button drawn by the catalog. It does not submit a form unless the caller sets `type`.
 */
export const Button = ({
  variant = 'neutral',
  loading = false,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    type={type}
    aria-busy={loading ? true : rest['aria-busy']}
    aria-disabled={loading ? true : rest['aria-disabled']}
    data-loading={loading ? '' : undefined}
    onClick={(event) => {
      if (loading) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }}
    className={`${baseClass} ${variantClass[variant]}`}
  >
    {loading && <Spinner />}
    {children}
  </button>
)
