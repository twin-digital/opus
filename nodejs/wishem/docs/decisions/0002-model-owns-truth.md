# 0002. The game model owns truth

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

Anything that holds truth about the game is native to the agent. Anything that only presents that truth can come off the shelf.

A library can hold game truth only if it passes the model contract in `../concepts.md`. A renderer, a sound system, or an input device is an I/O subsystem and follows lighter rules.

## Reason

The designer must be able to pause after a missed jump and say "make the player jump height high enough so I would have made this". The agent then needs the state, the recorded inputs, the jump rule, and a way to run the same inputs again. A renderer or physics system that hides its state makes this impossible.

Off-the-shelf libraries are acceptable only if everything in them can be exposed properly to the agent.

## Rejected alternatives

- **Take scene graph, physics, and animation from PixiJS or Phaser as they are.** The agent proposed this and the owner rejected it. These parts hold game truth.
- **Ban off-the-shelf libraries for game truth.** Too strict. Some libraries pass the contract.
- **An agent that drives an existing engine through its MCP server.** Fast to start. It cannot rewind or rerun.

## Consequences

- The renderer's object tree is a picture of the game model and is built again from it.
- Each library is judged against a contract before a game adopts it.
