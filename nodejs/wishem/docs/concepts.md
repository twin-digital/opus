# Concepts

> Blueprint, not a specification. See `README.md` for the status labels. Terms are defined in `glossary.md`.

## The game model

The game model is the part of a game that holds all game truth. It runs with no window. The renderer draws a picture of the model and never owns any of it.

### Entities and components (**Proposed** as the fixed core)

- An **entity** is a thing in the game: the hero, an Elf Ghost, a tree, a door.
- A **component** is a declared set of fields with optional behavior. An entity is the set of its components.
- A **component type** is the declaration of a component: its name, its fields, and what it can affect.

This is the model that Unity developers know: game objects with attached components that carry state and behavior. Making a game is mostly the work of creating and managing the correct components. That is also the work of the agent.

There is one difference from Unity. All state lives in declared fields, and behavior code keeps no state of its own (rule R4). This is what allows a snapshot, a rewind, and the replacement of code in a running game.

Earlier ideas map onto this model:

| Idea from the brainstorm              | In the model                                          |
| ------------------------------------- | ----------------------------------------------------- |
| "Declare and register a concept"      | Define a component type                               |
| The `invisible` status                | A component, or an entry in a `Statuses` component    |
| The rule that reveals the ghosts      | A behavior on a component                             |
| An inspector and tables in the editor | Tools derived from the declared fields                |
| A "self-constructing engine"          | A library of component types that grows with the game |

### The registry

Every component type and every other kind of thing is registered (rule R6). The agent queries the registry to learn what exists and what each kind can do.

Example: before the agent adds an `invisible` status, it asks what a status can affect. The answer can be "is drawn", "can be hit", "deals damage", and "blocks movement". The agent fills in the values. It asks the designer where the value is a design choice.

### Two graphs

A game has two structures that look alike and are different.

- The **game graph** uses the game's words: "Elf Ghost, invisible, in Golden Grove". The model owns it. The agent speaks it.
- The **render graph** uses the renderer's words: "sprite, alpha 0, layer 3". The renderer owns it. It is built again from the game graph.

In a 3/4 perspective the two also disagree on order. Drawing order follows the y position. The grouping of the game graph does not.

### Authored state and live state

- **Authored state** is what is stored in files: rooms, entity definitions, prompts, statements, assets.
- **Live state** is the state of the running game.

A change that the agent makes in a paused game is written back to the authored state, so that the change is still there the next day.

## Time

The model advances in fixed steps. Random values come from a seed. Every input is recorded. (rule R3)

These operations follow from that:

| Operation    | Meaning                                                     |
| ------------ | ----------------------------------------------------------- |
| **Step**     | Advance the model by a number of steps with given inputs.   |
| **Snapshot** | Save the whole live state as data.                          |
| **Restore**  | Load a snapshot.                                            |
| **Rewind**   | Return to an earlier point of the current play session.     |
| **Rerun**    | Run recorded inputs again, with or without a changed value. |

A rerun with a changed value answers a question such as "would I have made the jump".

## Stored words

Wishem stores three kinds of designer words as data. (**Agreed**)

| Kind                   | What it produces                  | Runs                    |
| ---------------------- | --------------------------------- | ----------------------- |
| **Behavior prompt**    | A function                        | Again and again in play |
| **Generation prompt**  | An asset: a sprite, a room layout | Once, and on a reapply  |
| **Designer statement** | Nothing. It constrains.           | When the agent checks   |

### Behavior prompts

Where a traditional editor has a code editor with a function, Wishem has a text area with the designer's description of the behavior. The agent writes the function behind it.

A behavior has these parts:

| Part        | Content                                                         | Status       |
| ----------- | --------------------------------------------------------------- | ------------ |
| **Prompt**  | The designer's description. This is the source.                 | **Agreed**   |
| **Code**    | The function that the agent wrote from the prompt.              | **Agreed**   |
| **History** | Every prompt that shaped the behavior, viewable over time.      | **Agreed**   |
| **Fields**  | Declared values. Answers to clarifying questions become fields. | **Proposed** |
| **Checks**  | Small repeatable tests that the agent writes from the prompt.   | **Proposed** |

Two kinds of problem have two different fixes (rule R9):

- The code does not do what the prompt says. This is a bug. The agent changes the code.
- The code does what the prompt says, and the designer does not like it. The designer changes the prompt or adds to it.

More proposals:

- **Fields from answers.** If the agent asks what "near" means and the answer is 3 tiles, `distance = 3` becomes a field. The designer can change the field by hand without a request to the agent. (**Proposed**)
- **Names are links.** "Flute", "golden tree", and "invisible" in a prompt point at registered things. If the meaning of `invisible` changes, the agent knows which behaviors to check again. (**Proposed**)
- **Kept output.** A changed prompt changes the existing code and leaves the rest alone (rule R11). (**Proposed**)

### Native behaviors

A designer can view and edit the code behind a behavior. That action probably turns the behavior into a **native behavior**, and its prompt becomes locked. (**Agreed** as the likely direction. The details are open.)

### Generation prompts

A generation prompt has a one-time effect. "Scatter standard trees around" places trees once. It does not create a function that runs during play. Prompts that seed a map are asset-generating prompts, the same as prompts that make sprites.

- The prompt is always stored with its result. (**Agreed**)
- The agent records what the run produced, so that a reapply can remove it. (**Agreed**)
- The designer can change the prompt and select **reapply**. (**Agreed**)
- The designer can also edit the result by hand, for example by a drag. (**Agreed**)
- A hand edit is lost on a reapply unless the prompt was changed to match. The system warns first. (**Agreed**)
- A hand edit is not written back into the prompt. Why the designer moved a tree is not obvious: nearer to one thing, farther from another. A guess is brittle. (**Agreed**)
- The record is kept for each generated thing. Each tree knows which prompt made it and if a hand changed it since. The warning can then name the one changed tree. (**Proposed**)

Random map generation that runs during play is a different case. It is a behavior, not a generation prompt.

### Designer statements

A designer statement is a requirement in the designer's words, stored with the thing it describes. Example on a room: "cannot cross without hookshot".

- The agent checks a change against the statements that the change can affect. It does this the way a tester does manual testing. (**Agreed**)
- The agent can turn a statement into a deterministic automated test. (**Agreed**)
- The agent does not simulate the whole game with every power-up to find effects that no statement covers. (**Agreed**)
- When the agent notices such an effect, it tells the designer as a remark and does not block the change. (**Proposed**)

## Slots

A game is assembled from a fixed core and a set of choices. (**Agreed** as the shape)

- **Fixed in every game:** the entity and component model, time, the registry, the stored words.
- **Chosen for each game:** everything that plugs into the model. Each choice fills a **slot**.

There are two classes of slot.

### Truth slots

A truth slot holds game truth. Examples: live state storage, authored scenes, movement or physics, rules.

A library that fills a truth slot must pass the **truth contract**:

1. Its whole state can be read and written as data.
2. Its state can be saved and restored exactly.
3. The same input always gives the same result.
4. It runs with no window, faster than real time.

Candidates discussed (**Unverified**):

| Candidate                     | Truth contract | Notes                                                               |
| ----------------------------- | -------------- | ------------------------------------------------------------------- |
| ECS library such as bitECS    | Passes         | State is plain arrays. Components are declared.                     |
| Rapier physics (WASM)         | Passes         | Has snapshot and restore, and a deterministic build.                |
| Matter.js, Planck.js          | Partly         | Runs with no window. Save and restore needs custom work.            |
| Phaser Arcade physics         | Fails          | Tied to Phaser scenes and frame timing. No snapshot.                |
| PixiJS or Phaser display tree | Fails          | Holds GPU objects. Suitable as a render graph only.                 |
| Three.js `Object3D` tree      | Partly         | Works with no renderer and has a JSON format. Uses renderer words.  |
| LDtk or Tiled level files     | Passes         | For authored scenes. LDtk has a world grid of rooms with neighbors. |

A top-down game in a 16-bit style does not need a physics engine. Its movement is tile collision with integer positions.

### Presentation slots

A presentation slot holds no truth. Examples: renderer, sound, input.

A library that fills a presentation slot follows the **presentation contract**:

1. It draws from the game model.
2. It gives a screenshot on request.
3. It maps a point on the screen back to the entity drawn there.
4. It draws tool overlays, such as a ring that shows a distance.

Item 3 is what resolves "the platform to my right" and a click to inspect.

Under this contract a pixel-art game can pick PixiJS, a 3D game can pick Three.js, and a card game can pick plain HTML and CSS.

### Adapters

An adapter connects a library to a slot. An adapter is written when a game first picks that library (rule R7). The first game pays for one adapter in each slot.

## Tools

The designer sees the game through tools: a view of the screen, an inspector, tables of the registered kinds, a world map. See `mockups/`.

- Tools are built as the project needs them. Each game can have tools that only it uses. (**Agreed**)
- A table and an inspector for any registered kind are derived from its declaration. A hand-built panel is the exception. (**Proposed**)
- A toolkit exists so that the agent can add a tool without building an editor from nothing. (**Agreed** as an expected part of the base)
