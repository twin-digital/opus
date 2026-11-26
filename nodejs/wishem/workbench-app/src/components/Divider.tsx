export type DividerVariant = 'plain' | 'accent'

export interface DividerProps {
  /**
   * Default: `plain`.
   */
  variant?: DividerVariant
}

const variantClass: Record<DividerVariant, string> = {
  plain: 'h-px w-full bg-line',
  accent: 'h-0.5 w-14 bg-accent',
}

/**
 * A line. `plain` fills the width. `accent` is short and at the start.
 */
export const Divider = ({ variant = 'plain' }: DividerProps) => (
  <hr className={`m-0 border-0 ${variantClass[variant]}`} />
)
