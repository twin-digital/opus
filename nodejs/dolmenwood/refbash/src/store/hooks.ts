import { useStore } from './store-context.js'

/**
 * Retrieves the currently active theme.
 */
export const useTheme = () => useUi().theme

/**
 * Retrieves the UI store.
 */
export const useUi = () => useStore().ui
