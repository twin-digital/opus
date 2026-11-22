# 0010. The first game starts from scratch

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

The first game is built from scratch on Wishem. An earlier prototype of the game is a throwaway. Its art assets are likely to move to the first game. Its code and workflows do not.

## Reason

The first game is the first consumer of Wishem. The owner wants to build it from scratch and not integrate the prototype step by step.

## Rejected alternatives

- **Grow Wishem by extracting parts of the prototype.** In the prototype the renderer owns the running game. That conflicts with rule R1.
- **Move the prototype onto Wishem step by step.** Rejected by the owner.

## Consequences

- Wishem carries no constraint from the prototype's code.
- The prototype's sprite generation is evidence that roadmap project 4 can work.
