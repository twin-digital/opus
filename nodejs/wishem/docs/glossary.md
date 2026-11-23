# Glossary

> Blueprint, not a specification. See `README.md` for the status labels.

Use one term for each concept. Use these exact terms in specifications and in code.

The designer sees only some of these terms. The agent and the tools use the terms for the things that a designer makes and does: behavior prompt, asset prompt, expectation, bookmark, reapply. The other terms are internal. With the designer, the agent uses the words of the game.

Terms in each group are in alphabetical order.

## People and roles

**Agent**: The AI that builds and changes the game for the designer. The designer can call it Wishem, 'shem, or 'shemmy.

**Designer**: The person who directs the game. The designer gives direction in natural language and does not need to read code.

**Owner**: The person who owns the Wishem project and confirms its decisions.

**Wishem**: The product. Also the name of the agent.

## The model

**Authored state**: What is stored in files: rooms, entity definitions, prompts, expectations, assets. It is part of the game model.

**Behavior**: Something a component does during play. A behavior has a prompt, code, fields, checks, and a history.

**Component**: A declared set of fields with optional behavior, attached to an entity. Each component has a component type.

**Component type**: The declaration of a component: its name and its fields. A component type can have behaviors. A component type that only one entity uses is normal.

**Definitions**: The declared kinds in a game model: component types, entity definitions, and relations. They say what can exist. The registry reports them.

**Entity**: A thing in the game. An entity is the set of its components. The components of one entity can be in different subsystems.

**Entity definition** (**Proposed**): The declaration of a kind of entity, such as "goat": its name and its component types.

**Event** (**Proposed**): Something that happens in the game at one step. A behavior can respond to an event. The game can make a bookmark at an event.

**Field**: One declared value in a component.

**Game model**: What the game is: its definitions, its behaviors, and its authored state.

**Game state**: The authored state and the live state together.

**ID** (**Proposed**): The name of a registered thing that code and links use. It does not change.

**Label** (**Proposed**): The name of a registered thing that the designer sees. The designer can change it.

**Live state**: The state of one simulation.

**Native behavior**: A behavior whose current version a person wrote by hand. It stays native until the designer gives it a new prompt.

**Registry**: The record of the definitions. The agent queries it. The registry does not hold the things themselves. The things are in the authored state and the live state.

**Relation**: A declared field that refers to another entity. Examples: a room contains an entity, and a held item is attached to the hero.

## Time

**Bookmark**: A named point in a recording. Rewind and rerun use it as their target.

**Play session**: A simulation with a player at the controls.

**Recording**: The seed and the inputs of a simulation.

**Rerun**: To run a recording again in a new simulation, with or without a changed value.

**Restore**: To load a snapshot.

**Rewind**: To return to an earlier point of the current play session.

**Simulation**: One running instance of a game model. It has its own live state, position in time, source of inputs, and recording. The core advances it in steps. It runs with no window. This is an internal term. With the designer, say "the game".

**Snapshot**: The whole live state of a simulation, saved as data.

**Step**: One fixed advance of a simulation.

## Directives

**Asset prompt**: A prompt with a one-time effect that produces an asset.

**Behavior prompt**: The designer's description of a behavior. It is the source of the behavior.

**Directive**: Natural-language text from the designer that Wishem stores and keeps the game in agreement with. The three kinds are behavior prompt, asset prompt, and expectation. This is an internal term.

**Expectation**: Natural-language text from the designer that states something that must stay true. It is stored with the thing it describes. Example: "cannot cross the gap without the grapple".

## Generated things

**Asset**: A generated or imported thing that the game uses: a sprite, a room layout, a sound.

**Hand edit**: A direct change by the designer to a generated thing, such as a drag.

**Managed execution** (**Proposed**): The work that the agent does around a run of an asset prompt: select the kind of reapply, find what the run affects, keep IDs, and report errors.

**Provenance**: For a thing in the authored state, the record of what made it and what changed it since. The source is an asset prompt, the designer by hand, or the agent on a request with no stored prompt.

**Reapply**: To run an asset prompt again. A refresh and a regenerate are the two proposed kinds.

**Refresh** (**Proposed**): A reapply that replaces only the things that the run made, and keeps the IDs of the things that stay.

**Regenerate** (**Proposed**): A reapply that makes the result again from the start.

**Run**: One time that the agent carries out an asset prompt. A run produces things.

## Checking

**Assumption**: A value or meaning that the agent chose without asking the designer.

**Check**: A repeatable test that the agent writes from a behavior prompt or an expectation.

## Subsystems

**Adapter**: The code that connects a library to a subsystem.

**Built-in subsystem**: A subsystem that Wishem provides. It is in every game.

**Core**: The part of Wishem that is not a subsystem. It runs the simulations: it steps the subsystems, joins their parts into the live state, and keeps time and recordings.

**I/O subsystem**: An output subsystem or an input subsystem.

**Input subsystem**: A subsystem that changes what the player does into recorded inputs. Examples: gamepad, keyboard.

**Model contract**: The four conditions a library must pass to provide a model subsystem.

**Model library**: A library that provides a model subsystem.

**Model subsystem**: A subsystem that holds game state or game rules. Examples: physics, authored scenes.

**Output subsystem**: A subsystem that shows or plays a simulation. Examples: renderer, sound.

**Renderer contract**: The four things a renderer must do.

**Subsystem**: A part of a game that has one job. Wishem provides it, or a library provides it through an adapter.

## Tools

**Tool**: A part of the designer's view of the game: a screen view, an inspector, a table, an overlay.

## Terms that are not used

| Do not use                                | Use                                            | Reason                                                                                                       |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Client and server                         | Game model and renderer                        | No wire protocol exists. See rule R17.                                                                       |
| Designer statement                        | Expectation                                    | One word for the concept.                                                                                    |
| Engine, for Wishem as a whole             | Wishem, or the game model                      | No engine is built ahead of a game.                                                                          |
| Game truth                                | Game state and rules                           | Plain words for the same thing.                                                                              |
| Generation prompt                         | Asset prompt                                   | Shorter, and it pairs with "behavior prompt".                                                                |
| Invariant, constraint, requirement        | Expectation                                    | An expectation can be soft. Games and physics libraries use "constraint" and "requirement" for other things. |
| Origin record                             | Provenance                                     | Provenance is the usual term for this record.                                                                |
| Presentation slot                         | Output subsystem or input subsystem            | Input is not presentation.                                                                                   |
| Scene graph                               | Game model, or the renderer's objects          | Use "game model" for entities and components. Use "the renderer's objects" for the display side.             |
| Script                                    | Behavior                                       | The prompt is the source, not a script.                                                                      |
| Sim                                       | Simulation                                     | Write the word in full.                                                                                      |
| Slot                                      | Subsystem                                      | Games use "slot" for equipment and saved games.                                                              |
| Stored words                              | Directive                                      | Internal term for the three kinds together.                                                                  |
| Truth slot, truth library, truth contract | Model subsystem, model library, model contract | Plain words for the same things.                                                                             |
