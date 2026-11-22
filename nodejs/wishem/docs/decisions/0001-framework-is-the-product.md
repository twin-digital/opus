# 0001. The framework is the product

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

Wishem, the just-in-time game development environment, is the product. The first game is a consumer of Wishem.

Wishem is a personal project that is used to build a real game first. It can become a product for other people later.

## Reason

The owner wants to build the framework. The game is "an incidental first user". The plan is to dogfood first. The project can stay personal, and it can become a product if it proves useful.

## Rejected alternatives

- **Build the game on an existing engine such as Godot.** This is the fastest way to a game. It does not give an agent that can rewind and rerun play.
- **Build the genre-agnostic wire protocol as the product.** The protocol serves other people's games in other engines. The first game needs little of it.

## Consequences

- A feature is justified by the conversation between a designer and the agent, not by the needs of one game.
- The first game still decides the order of work, because it is the test.
