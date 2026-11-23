# 0001. The framework is the product

> Blueprint, not a specification. See `../README.md` for the status labels.

## Decision

Wishem, the just-in-time game development environment, _is_ the product. Any game produced is a consumer of Wishem, and would be its own separate product.

Wishem is a personal project first and foremost. It can become a product for other people later.

## Reason

The owner wants to build the environment. A game is "an incidental first user" of it. The plan is to dogfood first. The project can stay personal, and it can become a product if it proves useful.

## Rejected alternatives

- **Build the game on an existing engine such as Godot.** This is the fastest way to a game, but does not accomplish the goal of building the just-in-time game development environment.
- **Build the genre-agnostic wire protocol as the product.** The protocol serves other people's games in other engines. The first game needs little of it.

## Consequences

- A feature is justified by the conversation between a designer and the agent, not by the needs of one game.
- The first game still decides the order of work, because it is the test.
- A game has its own product folder in this repository. It is not inside `nodejs/wishem/`.
