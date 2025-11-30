import { createGameStore } from './game-store.js'
import { UiStore } from './ui-store.js'

export const createRootStore = () => ({
  ...createGameStore(),
  ui: new UiStore(),
})
