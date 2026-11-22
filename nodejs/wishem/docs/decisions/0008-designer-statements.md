# 0008. Designer statements bound the agent's checking

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

A designer writes requirements in natural language and attaches them to the thing they describe, for example "cannot cross without hookshot" on a room. The agent checks its changes against these statements. It can turn a statement into a deterministic automated test.

The agent does not search the whole game for effects that no statement covers.

## Reason

A simulation of every gap in the game with every power-up is not wanted. The agent does not know the designer's intent about what is possible and what is not.

## Rejected alternatives

- **A full check of the game after every change.** The agent cannot know which results are intended.
- **A static proof that every dungeon can be completed.** The starting notes proposed this. It can return as a kind of check for a statement. It is not a default.

## Consequences

- A room with no statement gets no promise.
- Proposed: the agent still remarks on a side effect that it notices, and does not block the change.
