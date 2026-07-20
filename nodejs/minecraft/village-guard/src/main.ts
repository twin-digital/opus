import { world, system } from '@minecraft/server'

import { registerInvulnerabilityGuard } from '@twin-digital/mc-pack-core'

import { startVillagerGuard } from './villager-guard.js'

// Registering event handlers and intervals is allowed during a script's "early
// execution" (module load); native calls like world.sendMessage / runCommand are
// NOT — they must be deferred to system.run or an event callback, or the whole
// module throws on load.
registerInvulnerabilityGuard()
startVillagerGuard()

// This runs on every /reload, so the banner is your proof the dev loop works.
system.run(() => {
  world.sendMessage('§a[hello-pack] loaded §7— villager guard active')
})
