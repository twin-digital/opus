# 0009. The entity and component model is the same in every game

> Blueprint, not a specification. See `../README.md` for the status labels.

## Decision

The entity and component model is the same in every game. An entity is a set of components. A component is declared state with optional behavior. This model is the language that the agent speaks.

What stores the entities and components is a built-in subsystem. A library can replace it through an adapter.

**Proposed:** all state lives in declared component fields, and behavior code keeps no state of its own (rule R4).

## Reason

The owner thinks of a game as entities with attached components that carry behavior and state, as in Unity. Making the game is mostly the work of creating and managing the correct components. The agent needs one stable language across games, and the model contract are written in its terms.

The rule about state is what allows snapshot, rewind, and the replacement of code in a running game. A Unity component can keep state in private fields and running coroutines, and Unity cannot rewind.

## Rejected alternatives

- **A different entity model for each game.** The agent would have no stable language.
- **Unity-style components with free state.** A snapshot would not contain the whole game.

## Consequences

- Rule R4 is not confirmed. Confirm it in the OpenSpec change for the core model.
- An ECS library can provide the storage. The model is Wishem's own concept.
