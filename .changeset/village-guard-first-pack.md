---
'@twin-digital/village-guard': minor
---

feat(minecraft): village-guard, a behavior pack that keeps villagers alive

Every villager, wandering trader and iron golem is protected, in every dimension, with no opt-in
and no configuration. Two world-wide `entityHurt` subscriptions split each hit three ways: an
operator's deliberate removal lands, a player's hit is cancelled so it does nothing at all, and
every other hit is written down to a token amount with the mob restored to full health in the same
tick.
