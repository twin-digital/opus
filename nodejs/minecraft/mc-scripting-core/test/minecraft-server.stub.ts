// Runtime stand-in for the types-only @minecraft/server package (it ships only
// index.d.ts, so vitest can't resolve the real module). Aliased in via
// vitest.config.ts. Exposes just the surface mc-scripting-core touches at
// runtime, plus `hurtHandlers` so tests can fire the subscribed callbacks. Types
// (Entity, etc.) still resolve to the real package at compile time.
type HurtHandler = (event: { hurtEntity: unknown }) => void

/** Every handler registered via world.afterEvents.entityHurt.subscribe. */
export const hurtHandlers: HurtHandler[] = []

export const world = {
  afterEvents: {
    entityHurt: {
      subscribe: (handler: HurtHandler): void => {
        hurtHandlers.push(handler)
      },
    },
  },
}
