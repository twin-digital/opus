import type { ReactNode } from 'react'
import { useInput } from 'ink'
import { useStore } from '../store/store-context.js'

/**
 * Props for the StoreProvider component.
 */
interface Props {
  /**
   * Child components to wrap with game context
   */
  children: ReactNode
}

/**
 * Provider component which installs the {@link InputController} from the ui store to listen for ink's input events.
 */
export const InputProvider = ({ children }: Props) => {
  const store = useStore()

  useInput((input, key) => {
    void store.ui.input.handleInput(input, key)
  })

  return <>{children}</>
}
