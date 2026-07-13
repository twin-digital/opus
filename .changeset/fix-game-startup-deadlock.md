---
'@thrashplay/music': patch
---

Fix the ear-training games never starting: the engine ticks the program every frame from the
moment it's entered, but the state machine's initialization is deferred behind the spoken game
announcement — and an uninitialized machine still advanced through its un-entered initial state
into `play-challenge` holding the placeholder NullChallenge, whose empty sequence never
completes. The game wedged permanently: no challenge notes, and key presses were ignored
because `wait-for-response` was never reached. `StateMachine.update()` is now a no-op until
`initialize()` runs (and `shutdown()` is a no-op on a never-initialized machine).
