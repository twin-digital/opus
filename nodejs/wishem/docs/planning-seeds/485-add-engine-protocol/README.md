# Other engines

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project lets a renderer in another engine, such as Unity or Godot, show a simulation. It is parked until a second engine is wanted.

## Result

- A wire protocol between a simulation and a renderer in another engine.

## Depends on

[Core model](../479-add-core-model/README.md).

## What is agreed

- A game uses one renderer behind an adapter, and no wire protocol is built now. See rule R17 in [`rules.md`](../../rules.md).
- Rule R1 keeps this project possible, because the game model and a simulation never depend on a renderer.
- The export of a game to a native project in another engine is a different, later idea.

## Notes

- The notes that started the brainstorm studied this protocol: the levels of work that a client does, latency, bandwidth for each genre, three ways to send state, and a comparison with Colyseus. [`brainstorm.md`](../../brainstorm.md) has a summary in section 0. Use that study as input.
