# Concepts

> Blueprint, not a specification. See `README.md` for the status labels. Terms are defined in `glossary.md`.

The examples in this file use the quarry room from `interactions.md`. That room has a gap that the player crosses with a grapple, two goats, and a shift whistle.

## The game model

The game model is the part of a game that holds all game state and all game rules. It runs with no window. The renderer draws a picture of the model and never owns any of it.

### Entities and components (**Agreed**)

- An **entity** is a thing in the game: the hero, a goat, an iron ring, a door.
- A **component** is a declared set of fields with optional behavior. An entity is the set of its components.
- A **component type** is the declaration of a component: its name, its fields, and what it can affect.

This is the model that Unity developers know: game objects with attached components that carry state and behavior. Making a game is mostly the work of creating and managing the correct components. That is also the work of the agent.

The entity and component model is the language that the agent speaks. It is the same in every game (rule R5). What stores the entities and components is a built-in subsystem. See "Subsystems".

There is one difference from Unity (**Proposed**). All state lives in declared fields, and behavior code keeps no state of its own (rule R4). This is what allows a snapshot, a rewind, and the replacement of code in a running game.

Earlier ideas map onto this model:

| Idea from the brainstorm              | In the model                                          |
| ------------------------------------- | ----------------------------------------------------- |
| "Declare and register a concept"      | Define a component type                               |
| The `docile` status                   | A component, or an entry in a `Statuses` component    |
| The rule that wakes the goats         | A behavior on a component                             |
| An inspector and tables in the editor | Tools derived from the declared fields                |
| A "self-constructing engine"          | A library of component types that grows with the game |

### The registry

Every component type and every other kind of thing is registered (rule R6). The agent queries the registry to learn what exists and what each kind can do.

Example: before the agent adds a `docile` status, it asks what a status can affect. The answer can be "chases the player", "deals damage on contact", "can be hit", and "blocks movement". The agent fills in the values. It asks the designer where the value is a design choice.

### Relations between entities (**Agreed**)

Entities relate to each other. A room contains the entities in it. An entity can be attached to another, as a held item is attached to the hero.

A relation is a declared field that refers to another entity. It is part of a snapshot, and the registry reports it, in the same way as any other field.

Which relations exist in every game, and which a game adds, is an open question.

### Authored state and live state

- **Authored state** is what is stored in files: rooms, entity definitions, prompts, expectations, assets.
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
| **Bookmark** | Give a name to a point in a recording.                      |

A rerun with a changed value answers a question such as "would I have made the jump".

### Bookmarks (**Agreed**)

A **bookmark** is a named point in a recording. Rewind and rerun use a bookmark as their target.

A bookmark gives the designer and the agent a shared name for a moment, in the way that an entity name gives them a shared name for a thing:

- "Go back to when I entered the room."
- "Rerun from where I picked up the grapple, with the higher jump."

The game makes bookmarks automatically at registered events. Examples:

- the player enters a room
- the player gets an item or an ability
- the player takes damage or fails
- the designer pauses the game
- the agent makes a change: one bookmark before the change and one after it
- a check of an expectation fails

Each game registers its own events, so each game has its own automatic bookmarks.

A bookmark has more uses:

- **Play from here.** The designer starts play at a bookmark.
- **A start for a check.** A check of "cannot cross the gap without the grapple" starts from a bookmark at the edge of the gap.
- **A report.** "It breaks here" is a bookmark that the agent can open.

A bookmark inside one play session is simple. A bookmark that is kept for a long time is not, because the game changes. See `open-questions.md`.

## Directives

A **directive** is natural-language text from the designer that Wishem stores and keeps the game in agreement with. There are three kinds. (**Agreed**)

"Directive" is an internal term. The tools and the agent use the names of the three kinds with the designer.

| Kind                | What it produces                  | Runs                    |
| ------------------- | --------------------------------- | ----------------------- |
| **Behavior prompt** | A function                        | Again and again in play |
| **Asset prompt**    | An asset: a sprite, a room layout | Once, and on a reapply  |
| **Expectation**     | Nothing. It constrains.           | When the agent checks   |

### Behavior prompts

Where a traditional editor has a code editor with a function, Wishem has a text area with the designer's description of the behavior (the "behavior prompt"). The agent writes the function behind it.

A behavior has these parts (**Agreed**):

| Part        | Content                                                         |
| ----------- | --------------------------------------------------------------- |
| **Prompt**  | The designer's description. This is the source.                 |
| **Code**    | The function that the agent wrote from the prompt.              |
| **History** | Every prompt that shaped the behavior, viewable over time.      |
| **Fields**  | Declared values. Answers to clarifying questions become fields. |
| **Checks**  | Small repeatable tests that the agent writes from the prompt.   |

How the agent writes and runs a check is not designed. See `open-questions.md`.

Two kinds of problem have two different fixes (rule R9):

- The code does not do what the prompt says. This is a bug. The agent changes the code.
- The code does what the prompt says, and the designer does not like it. The designer changes the prompt or adds to it.

**Kept code.** The code for a behavior is stored. When the prompt changes, the agent edits the stored code and changes only what the new prompt requires. It does not write the code again from the start (rule R11). (**Agreed**)

**Fields from answers.** If the agent asks how far the whistle carries and the answer is 8 tiles, `range = 8` becomes a field. The designer can change the field by hand without a request to the agent. (**Agreed**)

**Names are links.** "Shift whistle", "goat", and "docile" in a prompt point at registered things. If the meaning of `docile` changes, the agent knows which behaviors to check again. The tools show these links to the designer. See "Recognized names in text". (**Agreed**. The details are open.)

**IDs and labels (Proposed).** Each registered thing has an ID and a label. A field is the first case. Code and links use the ID. The designer sees the label and can change it at any time. The ID is not usually shown.

### Native behaviors

A designer can view and edit the code behind a behavior. That action probably turns the behavior into a **native behavior**, and its prompt becomes locked. (**Agreed** as the likely direction. The details are open.)

### Asset prompts

An asset prompt has a one-time effect. "Break up the floor with rubble piles" places rubble once. It does not create a function that runs during play. Prompts that seed a map are asset-generating prompts, the same as prompts that make sprites.

- The prompt is always stored with its result. (**Agreed**)
- The agent records what the run produced, so that a reapply can remove it. (**Agreed**)
- The designer can change the prompt and select **reapply**. (**Agreed**)
- The designer can also edit the result by hand, for example by a drag. (**Agreed**)
- A hand edit is lost on a reapply unless the prompt was changed to match. The system warns first. (**Agreed**)
- A hand edit is not written back into the prompt. Why the designer moved a rubble pile is not obvious: nearer to one thing, farther from another. A guess is brittle. (**Agreed**)
- The record is kept for each generated thing. Each rubble pile knows which prompt made it and if a hand changed it since. The warning can then name the one changed pile. (**Proposed**)

Random map generation that runs during play is a different case. It is a behavior, not an asset prompt.

### Expectations

The idea of an expectation is agreed. The mechanism is not designed. The points below say what an expectation is for. They do not say how the agent checks one. See `open-questions.md`.

An expectation states, in natural language, something that must stay true. It is stored with the thing it describes. Example on a room: "cannot cross the gap without the grapple".

- The agent checks a change against the expectations that the change can affect. It does this the way a tester does manual testing. (**Agreed**)
- The agent can turn an expectation into a deterministic automated test. (**Agreed**)
- The agent does not simulate the whole game with every power-up to find effects that no expectation covers. (**Agreed**)
- When the agent notices such an effect, it tells the designer as a remark and does not block the change. (**Proposed**)

## Subsystems

A game is assembled from subsystems. A **subsystem** is a part of a game that has one job. Wishem provides a subsystem itself, or a library provides it through an adapter. (**Agreed**)

- A **built-in subsystem** is a subsystem that Wishem provides. It is in every game. Examples: the storage for entities and components, and the storage for authored state, which holds the registry and the directives.
- Each game chooses its other subsystems. Examples: physics, the renderer, sound.

The **core** is the part of Wishem that is not a subsystem. It steps the subsystems, joins their parts into the game model, and keeps time and recordings.

There are three kinds of subsystem.

| Kind                 | What it does                                       | Examples                                     |
| -------------------- | -------------------------------------------------- | -------------------------------------------- |
| **Model subsystem**  | Holds game state.                                  | Live state storage, authored scenes, physics |
| **Output subsystem** | Shows or plays the game model.                     | Renderer, sound                              |
| **Input subsystem**  | Changes what the player does into recorded inputs. | Gamepad, keyboard, touch                     |

Output subsystems and input subsystems together are the **I/O subsystems**.

### Model subsystems

A model subsystem holds game state. A library that provides a model subsystem is a **model library**. It must pass the **model contract**:

1. Its whole state can be read and written as data.
2. Its state can be saved and restored exactly.
3. The same input always gives the same result.
4. It runs with no window, faster than real time.

Candidates discussed (**Unverified**):

| Candidate                     | Model contract | Notes                                                               |
| ----------------------------- | -------------- | ------------------------------------------------------------------- |
| ECS library such as bitECS    | Passes         | State is plain arrays. Components are declared.                     |
| Rapier physics (WASM)         | Passes         | Has snapshot and restore, and a deterministic build.                |
| Matter.js, Planck.js          | Partly         | Runs with no window. Save and restore needs custom work.            |
| Phaser Arcade physics         | Fails          | Tied to Phaser scenes and frame timing. No snapshot.                |
| PixiJS or Phaser display tree | Fails          | Holds GPU objects. Suitable as an output subsystem only.            |
| Three.js `Object3D` tree      | Partly         | Works with no renderer and has a JSON format. Uses renderer words.  |
| LDtk or Tiled level files     | Passes         | For authored scenes. LDtk has a world grid of rooms with neighbors. |

A top-down game in a 16-bit style does not need a physics engine. Its movement is tile collision with integer positions.

### How the game model is composed (**Proposed**)

The game model is a record with one key for each model subsystem. Each model subsystem contributes its part of the model. The game model is the view over all the parts. A built-in model subsystem contributes its part in the same way as one that a library provides.

- A snapshot of the game model is the snapshot of each model subsystem, under the same keys.
- The registry reports each kind of thing together with the model subsystem that owns it.
- The game model passes the model contract when each model subsystem passes it.
- The entity is what joins the parts. The physics part and the state storage part refer to the same goat by one entity.

### I/O subsystems

An I/O subsystem connects the game model to the player. It holds no game state. (**Agreed**)

These rules apply (**Proposed**):

- **I/O rule.** The game gives the same result when an I/O subsystem is removed.
- **Output rule.** The agent can learn what an output subsystem showed or played. For a renderer this is a screenshot. For sound this is a record of the sounds that played.
- **Input rule.** Each thing that an input subsystem sends to the game model is recorded. A recording or the agent can take the place of an input subsystem.

What an output subsystem holds is derived from the game model and can be built again from it at any time.

### The renderer contract

A renderer is an output subsystem with more requirements. It follows the **renderer contract**:

1. It draws from the game model.
2. It gives a screenshot on request.
3. It maps a point on the screen back to the entity drawn there.
4. It draws tool overlays, such as a ring that shows a distance.

Item 3 is what resolves "the platform to my right" and a click to inspect.

The renderer keeps its own objects, such as sprites, layers, and draw order. Wishem does not define them. Example: in a 3/4 perspective the renderer sorts by y position, and the game model has no such order.

Under this contract a pixel-art game can pick PixiJS, a 3D game can pick Three.js, and a card game can pick plain HTML and CSS.

### Adapters

An adapter connects a library to a subsystem. An adapter is written when a game first picks that library (rule R7). The first game pays for one adapter in each subsystem that a library provides.

A built-in subsystem needs no adapter. A library can replace a built-in subsystem through an adapter. Example: an ECS library as the storage for entities and components.

## Tools

The designer sees the game through tools: a view of the screen, an inspector, tables of the registered kinds, a world map. See `mockups/`.

- Tools are built as the project needs them. Each game can have tools that only it uses. (**Agreed**)
- A table and an inspector for any registered kind are derived from its declaration. A hand-built panel is the exception. (**Proposed**)
- A toolkit exists so that the agent can add a tool without building an editor from nothing. (**Agreed** as an expected part of the base)

### Recognized names in text (**Proposed**)

The tools highlight each known name in text. This applies to directives, to the designer's messages, and to the agent's replies. It also applies while the designer types.

A name is known if it is in one of these sets:

- the names of things in the game, such as "goat" and "the Kiln"
- the kinds that the game registered, such as "status" and "item"
- the terms of Wishem, such as "expectation", "bookmark", and "reapply"

The highlight has these effects:

- **Confirmation.** The designer sees that a name refers to the intended thing.
- **A signal for a new thing.** A name with no highlight is not known. In "the goats stay docile until the shift whistle blows", no highlight on "shift whistle" shows that the agent must create it or ask about it.
- **A way to the thing.** The designer selects a highlight to open the thing that it names.

There are two levels of recognition. A match against the registry is immediate and needs no agent. After the agent reads the text, it confirms what each name refers to, and the tools show that the link is confirmed.

A highlight means that a name is known. It does not mean that the agent understood the sentence.

For a directive, the confirmed links are stored with the text. When a thing gets a new name, the agent can then update or report each directive that refers to it.
