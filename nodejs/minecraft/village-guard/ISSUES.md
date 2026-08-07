# Known issues

What the pack does not do, and why. Each entry is a limit the pack ships with, not a bug awaiting a
patch.

## An iron golem still turns hostile to a player who hits it

**What you see.** Hit a protected iron golem and the hit itself does nothing — no flash, no sound,
no recoil, and the golem loses no health. It then turns hostile and will kill you. An accidental
swing costs the player something, which is what the pack promises it will not.

**Why.** An iron golem has no anger component. Its retaliation is
`minecraft:behavior.hurt_by_target`, whose `entity_types` filter decides who it will retaliate
against, and the engine sets the target from who swung rather than from whether damage landed.
Cancelling the hit is irrelevant to it. Measured on Bedrock 1.26.40.8 with `@minecraft/server` 2.8.0:

| the hit                                 | golem health after | times it struck back |
| --------------------------------------- | ------------------ | -------------------- |
| player-family attacker, cancelled       | 100 of 100         | 24                   |
| creeper-family attacker, damage landing | 61 of 100          | 0                    |

The creeper row is the whole mechanism: an attacker the filter excludes gets no retaliation even
after taking the golem down 39 health, and an attacker it admits gets retaliation even though the
hit was stopped.

**Why it is not fixed.** One mechanism works — sending the golem the vanilla
`minecraft:from_player` event, which swaps its filter for one excluding players. It has to arrive
before the hit does: it does not clear a target already set, `Entity.triggerEvent` throws inside a
before-event handler, and deferring it a tick loses the race about half the time. That leaves acting
on each golem as it arrives, which is a mob registry by another name, and the pack keeps none. The
event also writes a component group saved with the entity, which persists after the pack is
uninstalled and which no vanilla event removes — a permanent, irreversible change to every iron
golem in the world. That price was judged too high for what it buys.

**What is unknown.** Every golem measured was spawned directly. A village's own golem also carries
`minecraft:behavior.defend_village_target`, which targets players on village reputation and which
`minecraft:from_player` does not touch. Whether a village golem retaliates through that route
instead has not been measured, and measuring it needs a player at a client.

The full run is `evidence/minecraft/script-api/golem-probe/RESULTS.md` in the planning repository.
