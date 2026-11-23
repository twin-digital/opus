# 0003. No single interface over model libraries

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

Each game picks its own model libraries. Wishem does not provide one interface that hides several physics engines or several state stores.

## Reason

Such an interface makes the API portable and leaves the game not portable. The same jump value gives a different path in each physics engine. Every tuned value, every recording, and every check breaks when the library changes. The interface also offers only the features that all libraries share.

The owner preferred that each game picks its model libraries.

## Rejected alternatives

- **One physics interface with several engines below it.** Rejected for the reason above.
- **One model that stays identical across engines.** The agent offered this as the other reading of the question. The owner chose the choice for each game.

## Consequences

- A model library becomes part of that game's model.
- Libraries for I/O subsystems are also chosen for each game.
- Renderer adapters are small and are the route to portability across JavaScript renderers.
