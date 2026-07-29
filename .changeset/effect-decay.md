---
'@twin-digital/minecraft-test-lib': minor
---

Decay effect durations on the advance clock. An effect's duration now falls by one for every tick a
test advances — the rate the engine was measured at — and the effect is removed on the tick it
reaches zero, so the last tick it is readable on is the one reading 1.

Within each tick, `advanceTicks` increments the tick, applies decay, then runs that tick's
callbacks: a callback reads the value for its own tick, and an effect that runs out partway through a
multi-tick advance is already gone for the remaining ticks. The replacement rule is now plain
modelled behaviour, comparing against the duration remaining exactly as the engine does.

Expiry itself is the library's own rule and marked as such — nothing observed says what the engine
does when a duration reaches zero. It dispatches nothing, since 2.8.0 declares no effect-remove or
effect-expire signal to raise.
