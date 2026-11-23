# 0005. Nothing is built before a design needs it

> Blueprint, not a specification. See `../README.md` for the status labels.

## Decision

Wishem starts nearly empty. Concepts, tools, and adapters are added when a design first needs them. Each game can end with its own model and its own tools.

## Reason

The owner wants the engine to "self-construct": it builds a model as features are needed to support a design. The tools and editor panels are built in the same way as the project evolves. Each game can have its own model and its own tools.

## Rejected alternatives

- **Build a complete engine and editor, then make a game.** The complexity is too high as a first step.
- **A genre kit built ahead of the first game.** The starting notes proposed a top-down kit. The kit is what the first game leaves behind, not something built first.

## Consequences

- The product is what exists at the start of a project and the method by which the agent grows things. (**Proposed** reading)
- The editor in `../mockups/` is a destination that a project reaches. It is not a first deliverable.
- The owner expects a base to exist at the start of any game: entities and components, primitives for input, sound, and graphics, resource loading, animation, asset and behavior generation, and a toolkit for tools.
