# Glossary

> Blueprint, not a specification. See `README.md` for the status labels.

Use one term for each concept. Use these exact terms in specifications, code, and conversation with the designer.

## People and roles

**Owner**: The person who owns the Wishem project and confirms its decisions.

**Designer**: The person who directs the game. The designer gives direction in natural language and does not need to read code.

**Agent**: The AI that builds and changes the game for the designer. The designer can call it Wishem, 'shem, or 'shemmy.

**Wishem**: The product. Also the name of the agent.

## The model

**Game model**: The part of a game that holds all game truth. It runs with no window.

**Game truth**: Any state or rule that can change what happens in the game.

**Entity**: A thing in the game. An entity is the set of its components.

**Component**: A declared set of fields with optional behavior, attached to an entity.

**Component type**: The declaration of a component: its name, its fields, and what it can affect.

**Field**: One declared value in a component. All state lives in fields.

**Registry**: The record of every declared kind of thing in a game. The agent queries it.

**Game graph**: The entities and their relations, in the game's words. The model owns it.

**Render graph**: The renderer's objects, in the renderer's words. It is built from the game graph.

**Authored state**: What is stored in files: rooms, definitions, prompts, statements, assets.

**Live state**: The state of the running game.

## Time

**Step**: One fixed advance of the game model.

**Snapshot**: The whole live state, saved as data.

**Restore**: To load a snapshot.

**Rewind**: To return to an earlier point of the current play session.

**Recording**: The seed and the inputs of a play session.

**Rerun**: To run a recording again, with or without a changed value.

## Stored words

**Behavior**: Something a component does during play. A behavior has a prompt, code, and a history. Fields and checks are proposed parts.

**Behavior prompt**: The designer's description of a behavior. It is the source of the behavior.

**Native behavior**: A behavior whose code a person edited directly. Its prompt is locked.

**Generation prompt**: A prompt with a one-time effect that produces an asset.

**Asset**: A generated or imported thing that the game uses: a sprite, a room layout, a sound.

**Origin record**: The record of which generation prompt made a thing and if a hand changed it since.

**Reapply**: To run a generation prompt again and replace what its last run produced.

**Hand edit**: A direct change by the designer to a generated thing, such as a drag.

**Designer statement**: A requirement in the designer's words, stored with the thing it describes. Example: "cannot cross the cut without the grapple".

**Check**: A repeatable test that the agent writes from a behavior prompt or a designer statement.

**Assumption**: A value or meaning that the agent chose without asking the designer.

## Assembly

**Slot**: A part of a game that is chosen for each game.

**Truth slot**: A slot that holds game truth. Examples: physics, authored scenes.

**Presentation slot**: A slot that holds no game truth. Examples: renderer, sound, input.

**Truth contract**: The four conditions a library must pass to fill a truth slot.

**Presentation contract**: The four things a library must do to fill a presentation slot.

**Truth library**: A library that fills a truth slot.

**Adapter**: The code that connects a library to a slot.

**Tool**: A part of the designer's view of the game: a screen view, an inspector, a table, an overlay.

## Terms that are not used

| Do not use                      | Use                        | Reason                                               |
| ------------------------------- | -------------------------- | ---------------------------------------------------- |
| Scene graph                     | Game graph or render graph | The term hides which of the two graphs is meant.     |
| Invariant                       | Designer statement         | The designer writes it in natural language.          |
| Engine, for Wishem as a whole   | Wishem, or the game model  | No engine is built ahead of a game.                  |
| Sim                             | Game model                 | One term for the concept.                            |
| Script                          | Behavior                   | The prompt is the source, not a script.              |
| Provenance                      | Origin record              | Simpler word for the same record.                    |
| Regenerate, for a room or image | Reapply                    | Reapply names the designer's action and its warning. |
| Client and server               | Game model and renderer    | No wire protocol exists. See `decisions/0004`.       |
