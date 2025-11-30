import React, { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { createRootStore } from './root-store.js'

type RootStore = ReturnType<typeof createRootStore>
const StoreContext = createContext<RootStore | undefined>(undefined)

/**
 * Props for the StoreProvider component.
 */
interface StoreProviderProps {
  /**
   * Child components to wrap with game context
   */
  children: ReactNode

  /**
   * Store which is being managed by this provider.
   */
  store: ReturnType<typeof createRootStore>
}

/**
 * Provider component that manages a global store via React Context.
 * Wrap your app with this component to enable access to store hooks.
 */
export const StoreProvider = ({ children, store }: StoreProviderProps) => {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

/**
 * Hook to access the store.
 *
 * @returns Current store
 * @throws Error if used outside of StoreProvider
 */
export const useStore = (): RootStore => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}
