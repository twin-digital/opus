# Glossary

> Blueprint, not a specification. See `README.md` for the status labels.

Use one term for each concept. Use these exact terms in specifications, code, and conversation with the designer.

## People and roles

**Owner**: The person who owns the Wishem project and confirms its decisions.

**Designer**: The person who directs the game. The designer gives direction in natural language and does not need to read code.

**Agent**: The AI that builds and changes the game for the designer. The designer can call it Wishem, 'shem, or 'shemmy.

**Wishem**: The product. Also the name of the agent.

## The model

**Game model**: The part of a game that holds all game state and all game rules. It runs with no window.

**Entity**: A thing in the game. An entity is the set of its components.

**Component**: A declared set of fields with optional behavior, attached to an entity.

**Component type**: The declaration of a component: its name, its fields, and what it can affect.

**Field**: One declared value in a component. All state lives in fields.

**Registry**: The record of every declared kind of thing in a game. The agent queries it.

**Authored state**: What is stored in files: rooms, definitions, prompts, expectations, assets.

**Live state**: The state of the running game.

## Time

**Step**: One fixed advance of the game model.

**Snapshot**: The whole live state, saved as data.

**Restore**: To load a snapshot.

**Rewind**: To return to an earlier point of the current play session.

**Recording**: The seed and the inputs of a play session.

**Rerun**: To run a recording again, with or without a changed value.

**Bookmark**: A named point in a recording. Rewind and rerun use it as their target.

## Directives

**Directive**: Natural-language text from the designer that Wishem stores and keeps the game in agreement with. The three kinds are behavior prompt, asset prompt, and expectation. This is an internal term. Do not use it with the designer.

**Behavior**: Something a component does during play. A behavior has a prompt, code, fields, checks, and a history.

**Behavior prompt**: The designer's description of a behavior. It is the source of the behavior.

**Native behavior**: A behavior whose code a person edited directly. Its prompt is locked.

**Asset prompt**: A prompt with a one-time effect that produces an asset.

**Asset**: A generated or imported thing that the game uses: a sprite, a room layout, a sound.

**Origin record**: The record of which asset prompt made a thing and if a hand changed it since.

**Reapply**: To run an asset prompt again and replace what its last run produced.

**Hand edit**: A direct change by the designer to a generated thing, such as a drag.

**Expectation**: Natural-language text from the designer that states something that must stay true. It is stored with the thing it describes. Example: "cannot cross the gap without the grapple".

**Check**: A repeatable test that the agent writes from a behavior prompt or an expectation.

**Assumption**: A value or meaning that the agent chose without asking the designer.

## Assembly

**Subsystem**: A part of a game that has one job. Wishem provides it, or a library provides it through an adapter.

**Built-in subsystem**: A subsystem that Wishem provides. It is in every game.

**Core**: The part of Wishem that is not a subsystem. It steps the subsystems, joins their parts into the game model, and keeps time and recordings.

**Model subsystem**: A subsystem that holds game state. Examples: physics, authored scenes.

**Output subsystem**: A subsystem that shows or plays the game model. Examples: renderer, sound.

**Input subsystem**: A subsystem that changes what the player does into recorded inputs. Examples: gamepad, keyboard.

**I/O subsystem**: An output subsystem or an input subsystem.

**Model contract**: The four conditions a library must pass to provide a model subsystem.

**Renderer contract**: The four things a renderer must do.

**Model library**: A library that provides a model subsystem.

**Adapter**: The code that connects a library to a subsystem.

**Tool**: A part of the designer's view of the game: a screen view, an inspector, a table, an overlay.

## Terms that are not used

| Do not use                                | Use                                            | Reason                                                                                                       |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Scene graph                               | Game model, or the renderer's objects          | Use "game model" for entities and components. Use "the renderer's objects" for the display side.             |
| Invariant, constraint, requirement        | Expectation                                    | An expectation can be soft. Games and physics libraries use "constraint" and "requirement" for other things. |
| Designer statement                        | Expectation                                    | One word for the concept.                                                                                    |
| Generation prompt                         | Asset prompt                                   | Shorter, and it pairs with "behavior prompt".                                                                |
| Stored words                              | Directive                                      | Internal term for the three kinds together.                                                                  |
| Engine, for Wishem as a whole             | Wishem, or the game model                      | No engine is built ahead of a game.                                                                          |
| Sim                                       | Game model                                     | One term for the concept.                                                                                    |
| Script                                    | Behavior                                       | The prompt is the source, not a script.                                                                      |
| Provenance                                | Origin record                                  | Simpler word for the same record.                                                                            |
| Regenerate, for a room or image           | Reapply                                        | Reapply names the designer's action and its warning.                                                         |
| Slot                                      | Subsystem                                      | Games use "slot" for equipment and saved games.                                                              |
| Game truth                                | Game state and rules                           | Plain words for the same thing.                                                                              |
| Truth slot, truth library, truth contract | Model subsystem, model library, model contract | Plain words for the same things.                                                                             |
| Presentation slot                         | Output subsystem or input subsystem            | Input is not presentation.                                                                                   |
| Client and server                         | Game model and renderer                        | No wire protocol exists. See `decisions/0004`.                                                               |
