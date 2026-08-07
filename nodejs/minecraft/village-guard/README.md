# @twin-digital/village-guard

A Minecraft Bedrock behavior pack that keeps every villager, wandering trader, trader llama and
iron golem alive.

Install it into a world and the protection is in force: every mob of those four types, in every
dimension, the ones already there and the ones that arrive later. There is nothing to opt into, no
way to exclude a mob, and no in-game configuration.

## What it does

A protected mob does not die from anything ordinary gameplay produces — a hostile mob, fire, a
fall, drowning, suffocation, an explosion — and a zombie never converts a protected villager.
Everything else about the mob is vanilla: it trades, restocks, breeds, gossips, panics and spawns
golems exactly as it would without the pack, and a wandering trader still despawns when its vanilla
timer runs out.

A hit still visibly lands. The mob flinches, is knocked back, makes its hurt sound and panics as
vanilla would; it simply ends the tick at full health. The pack adds no tell of its own — no
particles, no name tag, no chat output.

**A player's own hit is the exception: it does nothing at all.** The mob takes no harm and shows no
reaction, and the player's standing with it is unchanged, so an accidental swing costs nothing.

**An operator can still remove a protected mob.** `/kill` and anything else the engine reports as a
deliberate removal is left alone.

## Installing

The release asset is the pack itself — `village-guard-<version>.mcaddon`. Import it into Minecraft
Bedrock, or drop it into a dedicated server's `behavior_packs/` and activate it in the world. It
assumes nothing about the world beyond a vanilla server: no companion pack, no prepared world
state.

It requires an engine on the Bedrock 1.26 line or later that provides `@minecraft/server` 2.8.0.

## How it works

Two world-wide subscriptions, taken once while the script evaluates, and nothing else. There is no
registry of protected mobs, no dimension scan, no tracking of arrivals and departures, and no
periodic sweep — a mob is protected because the subscription sees its hit.

`world.beforeEvents.entityHurt` splits each hit three ways on its `damageSource`:

| the hit                            | what happens                                                    |
| ---------------------------------- | --------------------------------------------------------------- |
| cause `selfDestruct` or `override` | left alone, so an operator's removal lands                      |
| `damagingEntity` is a player       | cancelled, so nothing lands and the mob does not react          |
| everything else                    | `damage` written down to 0, and the mob restored to full health |

The write is zero and not a small survivable amount. A written-down hit reaches the mob at the
amount the handler wrote, so any non-zero constant kills a mob whose health is already at or below
it — and a zombie converts a villager that dies that way. Zero is the only constant no mob's health
can sit below, and it costs nothing: the engine's knockback is unchanged by the write, so the hit
still lands and the mob still reacts.

The restore carries a mob that was harmed before the pack first saw a hit on it back to full. It
happens in the matching `afterEvents.entityHurt` handler, which the engine delivers in the same
tick. A cancelled hit raises no after-event, so the two halves agree without coordinating.

The pack never makes a mob invulnerable and adds no effect to a mob.

## Working on it

From the root of the monorepo, on a clean checkout:

```sh
pnpm exec turbo run dev --filter=@twin-digital/village-guard -- --accept-eula
```

That is the whole of bringing the pack up on a live Bedrock server: turbo builds every workspace
package this one depends on, then runs the pack's own `dev` script. Running `pnpm --filter
@twin-digital/village-guard dev` directly skips those builds, and the pack cannot build without
them.

```sh
pnpm --filter @twin-digital/village-guard build           # the built pack, under dist/
pnpm --filter @twin-digital/village-guard test            # the unit suite
pnpm --filter @twin-digital/village-guard release-assets  # the .mcaddon, under .release-assets/
```

The build is [`@twin-digital/mc-dev-kit`](../mc-dev-kit/README.md)'s: it completes
`behavior_pack/manifest.json` from this package's `package.json`, bundles
`behavior_pack/scripts/main.ts`, and copies everything else. `dev` is
[`@twin-digital/mc-dev-server`](../mc-dev-server/README.md)'s, and `release-assets` is the kit's
`mc-pack-archive`. This package implements none of the three.

The protection itself is `src/protection.ts`, which takes its world as a parameter;
`behavior_pack/scripts/main.ts` is the four lines that hand it the real one. The suite in
`src/protection.test.ts` drives the same function against
[`@twin-digital/minecraft-test-lib`](../test-lib/README.md)'s in-memory engine.
