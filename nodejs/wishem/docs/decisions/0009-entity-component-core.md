# 0009. Entities and components are the fixed core

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Proposed

## Decision

The entity and component model is the same in every game. An entity is a set of components. A component is declared state with optional behavior.

All state lives in declared component fields. Behavior code keeps no state of its own.

## Reason

The owner thinks of a game as entities with attached components that carry behavior and state, as in Unity. Making the game is mostly the work of creating and managing the correct components. The agent needs one stable language across games, and both contracts are written in its terms.

The rule about state is what allows snapshot, rewind, and the replacement of code in a running game. A Unity component can keep state in private fields and running coroutines, and Unity cannot rewind.

## Rejected alternatives

- **The entity model as one more subsystem for each game.** The agent would have no stable language.
- **Unity-style components with free state.** A snapshot would not contain the whole game.

## Consequences

- The owner asked where entities and components fall in the plan and did not confirm this answer. Confirm it in the OpenSpec change for the core model.
- An ECS library can store the components. The model is Wishem's own concept.
