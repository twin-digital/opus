import { world, system } from '@minecraft/server'

import { startVillagerGuard } from './villager-guard.js'

// Registering event handlers and intervals is allowed during a script's "early
// execution" (module load); native calls like world.sendMessage / runCommand are
// NOT — they must be deferred to system.run or an event callback, or the whole
// module throws on load.
//
// The invulnerability heal-backstop registers itself lazily on first use (inside
// startVillagerGuard's setInvulnerable calls), so there's nothing to wire up here.
startVillagerGuard()

// This runs on every /reload, so the banner is your proof the dev loop works.
system.run(() => {
  world.sendMessage('§a[village-guard] loaded §7— villager guard active')
})
