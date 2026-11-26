import type { ReactNode } from 'react'

export type ForcedState = 'hover' | 'active' | 'focus' | 'focus-within'

export interface ForcedProps {
  /**
   * The state that the specimen shows with no pointer and no key.
   */
  state: ForcedState
  /**
   * Test id of the wrapper.
   */
  testId?: string
  children: ReactNode
}

/**
 * Forces the hover, active, focus, or focus-within look on one specimen. The `st-` variants of the specimen match the wrapper.
 */
export const Forced = ({ state, testId, children }: ForcedProps) => (
  <div data-force={state} data-testid={testId}>
    {children}
  </div>
)
