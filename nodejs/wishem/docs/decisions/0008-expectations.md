# 0008. Expectations bound the agent's checking

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

A designer writes expectations in natural language and attaches each one to the thing it describes, for example "cannot cross the gap without the grapple" on a room. The agent checks its changes against these expectations. It can turn an expectation into a deterministic automated test.

The agent does not search the whole game for effects that no expectation covers.

## Reason

A simulation of every gap in the game with every power-up is not wanted. The agent does not know the designer's intent about what is possible and what is not.

## Rejected alternatives

- **A full check of the game after every change.** The agent cannot know which results are intended.
- **A static proof that every dungeon can be completed.** The starting notes proposed this. It can return as a kind of check for an expectation. It is not a default.

## Consequences

- A room with no expectation gets no promise.
- Proposed: the agent still remarks on a side effect that it notices, and does not block the change.
