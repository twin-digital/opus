import { useFocus as useInkFocus } from 'ink'
import { useEffect, useRef } from 'react'

type InkInput = NonNullable<Parameters<typeof useInkFocus>[0]>

export interface FocusInput extends InkInput {
  /**
   * Callback invoked when this component loses focus.
   */
  onBlur?: () => void

  /**
   * Callback invoked when this component gains focus, either via user input or autoFocus.
   */
  onFocus?: () => void
}

export const useFocus = ({ onBlur, onFocus, ...rest }: FocusInput = {}) => {
  const inkFocusResult = useInkFocus(rest)
  const previouslyFocused = useRef<boolean | null>(null)

  useEffect(() => {
    if (previouslyFocused.current === null) {
      // On initial mount
      if (inkFocusResult.isFocused) {
        onFocus?.()
      }
    } else {
      // On subsequent updates (transitions only)
      if (inkFocusResult.isFocused && !previouslyFocused.current) {
        onFocus?.()
      } else if (!inkFocusResult.isFocused && previouslyFocused.current) {
        onBlur?.()
      }
    }
    previouslyFocused.current = inkFocusResult.isFocused
  }, [inkFocusResult.isFocused, onBlur, onFocus])

  return inkFocusResult
}
