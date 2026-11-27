# Rules

> Blueprint, not a specification. See `README.md` for the status labels.

These rules apply to every part of Wishem and to every product made with it. A design that breaks a rule needs the agreement of the owner and a change to the rule first.

> This file is the record of what is decided until a specification exists. Each rule has its reason. A line that starts with "Rejected:" gives an alternative that was considered and not selected. Read those lines before you propose a change. When an OpenSpec change is archived, the rules that it covers move into its specification and leave this file.

## State and time

**R1. All state and all rules are in the model and in the model subsystems of its constructs.** (**Agreed**)
None is in an I/O subsystem. The model and a model subsystem never depend on a renderer, a sound system, or an input device.
Reason: the agent must be able to read, change, and replay the product without a window.
Rejected: to take physics, scenes, and animation from a renderer library as they are. Those parts hold state.

**R2. A library can hold state only if it passes the model contract.** (**Agreed**)
The contract is in `concepts.md`. An I/O subsystem holds no state and follows lighter rules.
Reason: a library that hides state makes rewind and replay impossible.
Rejected: to ban each outside library that holds state. That is too strict, because some libraries pass the contract.

**R3. A construct can be recorded, replayed, and rewound. A construct that has a clock can also be paused and stepped.** (**Agreed**)
The same starting state and the same inputs always give the same result. The hub keeps each input in the record. A construct that has no clock has the record, rewind, and replay (**Proposed**).
Reason: "make the jump high enough so I would have made this" needs the agent to run the designer's exact inputs again.

**R4. All state lives in declared component fields. Behavior code keeps no state of its own.** (**Proposed**)
Reason: a snapshot must contain the whole live state. Code with no state can be replaced while the product runs.
Rejected: components that keep state where they like, as in Unity. A snapshot would not contain the whole live state.

## Concepts

**R5. The entity and component model is the same in every product.** (**Agreed**)
An entity is a set of components. A component is declared state with optional behavior. This model is the language that the agent speaks. What stores it is a built-in subsystem.
Reason: the agent needs one stable language across products. The model contract is written in its terms.
Rejected: a different entity model for each product. The agent would have no stable language.

**R6. Every kind of thing is declared and registered.** (**Agreed**)
The agent can always ask what kinds exist, what fields they have, and which behaviors read or change them. Each component has a component type.
Reason: the agent must discover the vocabulary of the product. Tools such as tables and inspectors are derived from the declarations.

**R7. Nothing is built before a design needs it.** (**Agreed**)
The model, the tools, and the library adapters grow when a product first needs them.
Exception: the PixiJS renderer and the Godot renderer, each with one kind of view, are built before a product needs them. They are the proof that the hub and the link serve more than one renderer.
Reason: the engine is meant to "self-construct" as features are needed to support a design.
Rejected: to build a complete engine and editor before a product. The complexity is too high as a first step.
Rejected: to build a kit for one genre before the first game. A kit is what the first game leaves behind.

## Directives

**R8. A prompt is always stored with its result.** (**Agreed**)
This applies to behaviors, generated sprites, generated room layouts, and every later kind of generated thing.

**R9. For a behavior, the prompt is the source and the code is derived.** (**Agreed**)
Code that does not do what the prompt says is a bug. The fix is a code change. Code that does what the prompt says and that the designer dislikes is a design change. The fix is a prompt change.
Reason: the designer does not need to read code.
Rejected: behaviors only as rules in data. Rules can be read without a run, but they cannot express everything, and a rule system must exist first. A rule system can be added later as one more concept.

**R10. The history of a behavior is stored with the behavior.** (**Agreed**)
The history holds each version. The agent wrote a version from a prompt, or a person wrote it by hand.

**R11. Generated output is kept, not regenerated.** (**Agreed**)
The code for a behavior is stored. When the prompt changes, the agent edits the stored code and changes only what the new prompt requires. A stored asset is replaced only when the designer asks.
Reason: two generations from one prompt differ. Tuned behavior and accepted art must not change by accident.

**R12. Hand edits to generated things are allowed. The system warns before a reapply destroys one.** (**Agreed**)
Hand edits are not written back into the prompt. To keep an edit across a reapply, the designer changes the prompt.
Reason: a drag does not say why the designer moved the thing.
Rejected: a hand edit that locks the prompt. A drag is a natural action on a room and must stay easy.
Rejected: the agent writes the hand edit into the prompt. The reason for the edit is not known.
Rejected: no hand edits, so that each change goes through the prompt. Drag and drop must be supported.

**R13. The agent records the provenance of each thing that a run of an asset prompt produced.** (**Agreed**)
Provenance lets a reapply replace the old result and detect hand edits.

## Intent and checking

**R14. Expectations record intent, and the agent checks changes against them.** (**Agreed**)
An expectation states, in natural language, something that must stay true. It is stored with the thing it describes.

**R15. The agent does not search the whole product for side effects that no expectation covers.** (**Agreed**)
Reason: the agent does not know what the designer intends to be possible or impossible.
Rejected: a full check of the product after each change.
Rejected: a proof that each dungeon can be completed, as a default. It can come back as one kind of check for an expectation.

**R16. The agent states the assumptions it made.** (**Proposed**)
When the agent chooses a value or a meaning without asking, the designer can see that choice.

## Scope

**R17. Each renderer is behind an adapter. A link connects a renderer in a different process to the hub.** (**Agreed**)
The model imports nothing from a renderer, and a construct can run with no window. A link between processes is built now. Three renderers use the same TypeScript hub: the React renderer, the PixiJS renderer, and the Godot renderer. No single interface hides different renderer libraries: each renderer has its own kind of view.
Each renderer reads the hub through a port. The link has a versioned protocol. (**Proposed**)
Reason: a process has one language, so a renderer in a different language, such as Godot, needs a link. Three renderers on one hub prove that the hub and the link do not depend on one renderer.

**R18. No single interface hides different model libraries.** (**Agreed**)
Each product picks its own model libraries. A model library becomes part of the model of that product. The libraries for I/O subsystems are also selected for each product.
Reason: one interface makes the code portable and leaves the product not portable. The same jump value gives a different path in each physics library. Each tuned value, each record, and each check breaks when the library changes. The interface also gives only the features that all the libraries have.
Rejected: one physics interface with more than one library below it.

**R19. A feature is justified by the conversation between a designer and the agent, not by the needs of one product.** (**Agreed**)
Wishem is the thing to build. A product is a consumer of Wishem and is separate from Wishem. The first game still decides the order of the work, because it is the test.
Rejected: to build the game on an engine that exists, such as Godot. That is the fastest way to a game, but it does not build Wishem.
Rejected: the wire protocol as the thing to build. It is for the games of other people in other engines.

## Structure

**R20. A subsystem communicates only with the hub.** (**Agreed**)
A subsystem has three operations on the hub: send an input, read the joined state, and get the hub events. A subsystem does not address a different subsystem, and it has no way to ask a different subsystem to do something. Control is state: pause is an input that sets `running` in the `time` part, and the clock reads `running`. This applies when the subsystem and the hub are in one process, and when they are in different processes.
Reason: the hub keeps the record of inputs. A replay gives the same result only if the hub sees each thing that changes state.
Rejected: a direct request from one subsystem to a different subsystem, for control such as pause. Control that the record does not hold makes a replay give a different result.
Rejected: a mesh, in which subsystems communicate with each other and the hub is one peer. A message between two subsystems is state that the hub did not see. The hub could not keep a record that gives the same result again.
