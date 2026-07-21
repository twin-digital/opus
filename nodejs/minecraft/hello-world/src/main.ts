import { world, system } from '@minecraft/server'

// A minimal standalone pack (no shared-lib dependency) — the second half of the
// "how do I develop several packs" example alongside village-guard.
//
// Greet each player the first time they spawn (join). Native calls like
// world.sendMessage cannot run during a script's "early execution" (module load)
// — but an event callback runs later, so this is fine. Registering the
// subscription at top level is allowed.
// § sequences are Minecraft chat formatting codes (§e yellow, §a green,
// §7 gray) — cosmetic color so pack messages stand out from regular chat.
world.afterEvents.playerSpawn.subscribe((event) => {
  if (event.initialSpawn) {
    world.sendMessage(`§eHello, ${event.player.name}! §7Welcome to the server.`)
  }
})

// Runs on every /reload, so this banner is your proof the dev loop works.
system.run(() => {
  world.sendMessage('§a[hello-world] loaded')
})
