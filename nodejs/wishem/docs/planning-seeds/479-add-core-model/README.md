# Core model

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project makes the base that each other project builds on. It gives a game model with entities and components, simulations that the agent can step, save, rewind, and run again, and a first renderer.

## Result

- Entities and components with declared fields, and the registry that reports the definitions.
- Simulations: step, snapshot, restore, rewind, rerun, and bookmarks.
- The core, and the built-in subsystems for the storage of entities and components and for authored state.
- The model contract, and a first adapter for a renderer.
- A first room in which a hero walks, as the start of the first game.

## Depends on

The blueprint only.

## What is agreed

- The game model has definitions, behaviors, and authored state. A simulation is one running instance of it. See [The game model](../../concepts.md#the-game-model).
- All game state and all game rules are in the game model and its simulations. See rules R1 and R2 in [`rules.md`](../../rules.md).
- A simulation can be stepped, recorded, replayed, and rewound. The same inputs give the same result. See rule R3 and [Time](../../concepts.md#time).
- The entity and component model is the same in every game. Each component has a component type. See rule R5.
- Relations between entities are declared fields.
- Bookmarks are named points in a recording. The game makes them automatically at registered events.
- Each kind of thing is declared and registered. See rule R6.
- A game is assembled from subsystems. Some are built in. The core is not a subsystem. See [Subsystems](../../concepts.md#subsystems).
- A library can hold game state only if it passes the model contract. Each game picks its own model libraries. See rule R18.
- The first renderer is one library behind an adapter. No wire protocol is built. See rule R17 in [`rules.md`](../../rules.md).
- Nothing is built before a design needs it. See rule R7.
- Wishem is written in TypeScript.

## What is proposed

- Rule R4: all state lives in declared component fields, and behavior code keeps no state of its own.
- The live state of a simulation is a record with one key for each model subsystem.
- The three rules for I/O subsystems: the I/O rule, the output rule, and the input rule.
- Each registered thing has an ID that code uses and a label that the designer can change.
- The terms "entity definition" and "event".

## Open questions

1. **What happens in the first minute of an empty project?** The brainstorm started from a project that already has content. What does the designer say first, and what exists before that sentence? Also for: [Agent access](../480-add-agent-access/README.md).
2. **Is "all state lives in declared fields" a hard rule?** Proposed as rule R4.
3. **What scopes exist for a registered thing?** The brainstorm mentioned scene scope and game scope and settled neither.
4. **Which relations between entities are in every game?** A room contains entities, and an entity can be attached to another. Which relations exist in every game, and which a game adds, is not settled.
5. **What kinds of reference exist, and what are they called?** The cases are a reference to a different component of the same entity, to a different entity, and to a component of a different entity, in the same subsystem or in different subsystems. It is also not settled if names need a namespace for each subsystem. See "References" in `concepts.md`.
6. **What belongs to the core and not to a subsystem?** The core runs the simulations: it steps the subsystems, joins their parts into the live state, and keeps time and recordings. The exact line between the core and the built-in subsystems is not settled.
7. **How does a kept bookmark stay valid when the game model changes?** A bookmark that is stored as a snapshot goes out of date when a component changes. A bookmark that is stored as a recording from the start always loads, but the same inputs can lead to a different place after a rule changes. The answer affects checks of expectations. Also for: [Expectations](../483-add-expectations/README.md).
8. **How is a field identified and named?** The proposal is an ID that code uses and a label that the designer can change. It is not settled how an ID is made, when the designer sees it, and if the same applies to each registered thing. Also for: [Behavior prompts](../481-add-behavior-prompts/README.md).
9. **Which libraries provide each subsystem for the first game?** Renderer: PixiJS or Phaser. Live state: an ECS library or custom code. Authored scenes: LDtk, Tiled, or a custom format. The facts about these libraries are unverified.
10. **What npm scope do the packages use?** This repository uses `@twin-digital/*` for most products and `@thrashplay/*` for Farwatch. The [first workbench UI slice](../477-first-workbench-ui-slice/README.md) answers this question.

## Notes

- The [first workbench UI slice](../477-first-workbench-ui-slice/README.md) builds thin parts of this project first: the registry, declared component types, entities, components, and the storage of authored state. The brainstorm for this project starts from what that slice built.

- The owner expects a base to exist at the start of each game: entities and components, basic parts for input, sound, and graphics, the loading of resources, animation, the generation of assets and behaviors, and a toolkit for tools.
- The lines that start with "Rejected:" in [`rules.md`](../../rules.md) give the alternatives that are closed for this project. See rules R1, R2, R4, R5, R7, R17, and R18.
- The ways to refer from one thing to another need a brainstorm. See [References](../../concepts.md#references-open).
- The facts about outside libraries in `concepts.md` are unverified. Check them before a library is selected.
- A top-down game in a 16-bit style does not need a physics engine. Its movement is tile collision.
- Discussed in the brainstorm and not recorded in a rule: a simulation advances in fixed steps, a behavior gets the length of a step as a value, and drawing runs at the rate of the display. Positions do not have to be integers. A game can select how numbers are held.
