export interface ButtonProps {
  label: string
  variant?: 'plain' | 'maker'
  disabled?: boolean
  busy?: boolean
  /** The place in the tab order, for a toolbar. */
  tabIndex?: number
  onPress?: () => void
}

const variants = {
  plain: 'border-control-border text-fg',
  maker: 'border-maker text-maker-text',
} as const

/** A button. A disabled button keeps the focus and the place in the tab order, and a press does nothing. */
export const Button = ({
  label,
  variant = 'plain',
  disabled = false,
  busy = false,
  tabIndex,
  onPress,
}: ButtonProps) => (
  <button
    type='button'
    tabIndex={tabIndex}
    aria-disabled={disabled ? true : undefined}
    aria-busy={busy ? true : undefined}
    onClick={() => {
      if (!disabled) {
        onPress?.()
      }
    }}
    className={`rounded-sm border bg-surface px-3 py-1.5 text-ui hover:bg-ground focus-visible:outline-2 focus-visible:outline-accent ${disabled ? 'border-control-border text-fg-muted' : variants[variant]}`}
  >
    {label}
  </button>
)
