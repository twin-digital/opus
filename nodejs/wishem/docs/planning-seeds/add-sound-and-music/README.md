# Sound and music

> Planning seed, not a specification. It collects what the blueprint knows about this topic, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This topic is how a game gets its sound effects and its music. It is not on the roadmap.

## What is agreed

- Sound is an output subsystem. It holds no game state. See [Subsystems](../../concepts.md#subsystems).
- An asset prompt can produce each kind of content that the game model defines. A sound is an asset. See [Asset prompts](../add-asset-prompts/README.md).

## What is proposed

- The agent can learn what sounds played, from a record of them.

## Open questions

1. **How is sound and music generated or imported?** The brainstorm did not discuss this.
2. **Does a generated sound have the same rules as a generated sprite?** The rules are a stored prompt, provenance, and reapply.
