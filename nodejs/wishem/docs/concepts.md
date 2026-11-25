# Concepts

> Blueprint, not a specification. See `README.md` for the status labels. Terms are defined in `glossary.md`.

The examples in this file use the quarry room from `examples/interactions.md`. That room has a gap that the player crosses with a grapple, two goats, and a shift whistle.

## The project (**Agreed**)

A **project** is what a designer makes with Wishem. It has two parts:

- the **product**: the part that the designer ships.
- the **workbench**: the part that the designer uses to make the product.

Each part is a model, and each model has its own core.

The workbench is a model that is made with Wishem. It is not a game. The workbench shows and changes the product.

"Product" is an internal term. With the designer, the agent says the word for the kind of product, such as "the game".

## The model

The **model** is what a core runs. It has three parts:

- the **definitions**: the declared kinds, such as component types, entity definitions, and relations. They say what can exist.
- the behaviors: the code that changes state during play.
- the authored state: the things that are stored in files. A simulation starts from them.

A **simulation** is one running instance of the model. It has its own live state, its own position in time, its own source of inputs, and its own recording. The core advances a simulation in steps. A simulation runs with no window. An I/O subsystem can be attached to a simulation and is not part of it.

More than one simulation of the same model can run at the same time. The designer plays in one simulation while the agent runs others, for example to rerun a jump or to do checks.

"Simulation" is an internal term. With the designer, the agent says the word for the kind of product, such as "the game".

The renderer draws a picture of a simulation and never owns any of it.

### Entities and components (**Agreed**)

- An **entity** is a thing in a model: the hero, a goat, an iron ring, a door.
- A **component** is a declared set of fields with optional behavior. An entity is the set of its components.
- A **component type** is the declaration of a component: its label and its fields. The declaration is data in the model folder, not code. A component type can have behaviors.
- Each component has a component type. No component exists without a type. A component type that only one entity uses is normal.

This is the model that Unity developers know: game objects with attached components that carry state and behavior. Making a game is mostly the work of creating and managing the correct components. That is also the work of the agent.

The entity and component model is the language that the agent speaks. It is the same in every product (rule R5). What stores the entities and components is a built-in subsystem. See "Subsystems".

There is one difference from Unity (**Proposed**). All state lives in declared fields, and behavior code keeps no state of its own (rule R4). This is what allows a snapshot, a rewind, and the replacement of code in a running product.

Earlier ideas map onto this model:

| Idea from the brainstorm              | In the model                                             |
| ------------------------------------- | -------------------------------------------------------- |
| "Declare and register a concept"      | Define a component type                                  |
| The `docile` status                   | A component, or an entry in a `Statuses` component       |
| The rule that wakes the goats         | A behavior on a component                                |
| An inspector and tables in the editor | Tools derived from the declared fields                   |
| A "self-constructing engine"          | A library of component types that grows with the product |

### The registry

Every component type and every other kind of thing is registered (rule R6). The agent queries the registry to learn what kinds exist, what fields each kind has, and which behaviors read or change each kind.

The registry reports the definitions. It does not hold the things themselves. The things are in the authored state and the live state.

Example: before the agent adds a `docile` status, it asks which behaviors read the statuses of an entity. The answer can be the chase behavior, the contact damage behavior, and the movement behavior. The agent then knows what a status is able to change. It asks the designer where the answer is a design choice.

### Relations between entities (**Agreed**)

Entities relate to each other. A room contains the entities in it. An entity can be attached to another, as a held item is attached to the hero.

A relation is a declared field that refers to another entity. It is part of a snapshot, and the registry reports it, in the same way as any other field.

Which relations exist in every product, and which a product adds, is an open question.

### References (**Open**)

The blueprint has several ways for one thing to point at another, and no shared terms for them. This needs a brainstorm in milestone 1.

The ways that exist now:

- a relation: a field of one entity refers to another entity
- a link: a name in a prompt refers to a registered thing
- an ID: the name that code and links use
- a link from a thing that is made during play to the thing in the authored state that made it
- provenance: a thing in the authored state refers to the prompt that made it

The cases to list in the brainstorm:

- a reference to a different component of the same entity
- a reference to a different entity
- a reference to a component of a different entity
- each of these when the two components are in the same subsystem, and when they are in different subsystems

A component is in one subsystem. An entity is not in a subsystem, because its components can be in different subsystems. The brainstorm must decide if names need a namespace for each subsystem.

### Authored state and live state

- **Authored state** is what is stored in files: rooms, entity definitions, prompts, expectations, assets. It is part of the model.
- **Live state** is the state of one simulation. A simulation makes its live state from the authored state when it starts.

"State" means the authored state and the live state together.

A change that the agent makes in a paused simulation is written back to the authored state, so that the change is still there the next day.

## Time

A simulation advances in fixed steps. Random values come from a seed. Every input is recorded. (rule R3)

These operations follow from that:

| Operation    | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| **Step**     | Advance a simulation by a number of steps with given inputs.                    |
| **Snapshot** | Save the whole live state of a simulation as data.                              |
| **Restore**  | Load a snapshot.                                                                |
| **Rewind**   | Return to an earlier point of the current play session.                         |
| **Rerun**    | Run recorded inputs again in a new simulation, with or without a changed value. |
| **Bookmark** | Give a name to a point in a recording.                                          |

A rerun with a changed value answers a question such as "would I have made the jump".

### Bookmarks (**Agreed**)

A **bookmark** is a named point in a recording. Rewind and rerun use a bookmark as their target.

A bookmark gives the designer and the agent a shared name for a moment, in the way that an entity name gives them a shared name for a thing:

- "Go back to when I entered the room."
- "Rerun from where I picked up the grapple, with the higher jump."

A simulation makes bookmarks automatically at registered events. Examples:

- the player enters a room
- the player gets an item or an ability
- the player takes damage or fails
- the designer pauses the simulation
- the agent makes a change: one bookmark before the change and one after it
- a check of an expectation fails

Each product registers its own events, so each product has its own automatic bookmarks.

A bookmark has more uses:

- **Play from here.** The designer starts play at a bookmark.
- **A start for a check.** A check of "cannot cross the gap without the grapple" starts from a bookmark at the edge of the gap.
- **A report.** "It breaks here" is a bookmark that the agent can open.

A bookmark inside one play session is simple. A bookmark that is kept for a long time is not, because the product changes. See [#479](https://github.com/twin-digital/opus/issues/479).

## Directives

A **directive** is natural-language text from the designer that Wishem stores and keeps the product in agreement with. There are three kinds. (**Agreed**)

"Directive" is an internal term. The tools and the agent use the names of the three kinds with the designer.

| Kind                | What it produces                  | Runs                    |
| ------------------- | --------------------------------- | ----------------------- |
| **Behavior prompt** | A function                        | Again and again in play |
| **Asset prompt**    | An asset: a sprite, a room layout | Once, and on a reapply  |
| **Expectation**     | Nothing. It constrains.           | When the agent checks   |

### Behavior prompts

Where a traditional editor has a code editor with a function, Wishem has a text area with the designer's description of the behavior (the "behavior prompt"). The agent writes the function behind it.

A behavior has these parts (**Agreed**):

| Part        | Content                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Prompt**  | The designer's description. This is the source.                                                                           |
| **Code**    | The function that the agent wrote from the prompt.                                                                        |
| **History** | Every version of the behavior, viewable over time. The agent wrote a version from a prompt, or a person wrote it by hand. |
| **Fields**  | Declared values. Answers to clarifying questions become fields.                                                           |
| **Checks**  | Small repeatable tests that the agent writes from the prompt.                                                             |

How the agent writes and runs a check is not designed. See [#481](https://github.com/twin-digital/opus/issues/481).

Two kinds of problem have two different fixes (rule R9):

- The code does not do what the prompt says. This is a bug. The agent changes the code.
- The code does what the prompt says, and the designer does not like it. The designer changes the prompt or adds to it.

**Kept code.** The code for a behavior is stored. When the prompt changes, the agent edits the stored code and changes only what the new prompt requires. It does not write the code again from the start (rule R11). (**Agreed**)

**Fields from answers.** If the agent asks how far the whistle carries and the answer is 8 tiles, `range = 8` becomes a field. The designer can change the field by hand without a request to the agent. (**Agreed**)

**Names are links.** "Shift whistle", "goat", and "docile" in a prompt point at registered things. If the meaning of `docile` changes, the agent knows which behaviors to check again. The tools show these links to the designer. See "Recognized names in text". (**Agreed**. The details are open.)

**IDs and labels (Agreed for a component type, a field, and an entity).** A component type, a field, and an entity each have an ID that does not change. The ID has a prefix for the kind of thing, an underscore, and a UUID. A component type and a field each have a label. The designer sees the label and can change it at any time. Code and links use the ID. The authored state refers to component types and fields by ID. The ID is not usually shown.

### Native behaviors

A person can view and edit the code behind a behavior. The edit makes a new version in the history, written by hand. A behavior whose current version was written by hand is a **native behavior**. (**Agreed**)

A native behavior is not locked. The designer can give it a new prompt. The agent then writes a new version, and the behavior is not native. (**Agreed**)

The agent starts the new version from the current code, as for each other prompt change (rule R11). A hand edit to code has the same problems as a hand edit to a generated room: the prompt does not describe it, and a later change can remove it. (**Proposed**)

### Asset prompts

An asset prompt has a one-time effect. "Break up the floor with rubble piles" places rubble once. It does not create a function that runs during play. Prompts that seed a map are asset-generating prompts, the same as prompts that make sprites.

- The prompt is always stored with its result. (**Agreed**)
- The agent records the provenance of each thing that the run produced, so that a reapply can replace it. (**Agreed**)
- The designer can change the prompt and select **reapply**. (**Agreed**)
- The designer can also edit the result by hand, for example by a drag. (**Agreed**)
- A hand edit is lost on a reapply unless the prompt was changed to match. The system warns first. (**Agreed**)
- A hand edit is not written back into the prompt. Why the designer moved a rubble pile is not obvious: nearer to one thing, farther from another. A guess is brittle. (**Agreed**)

Random map generation that runs during play is a different case. It is a behavior, not an asset prompt.

### Provenance (**Agreed**)

**Provenance** is the record of what made a thing in the authored state and what changed it since. Each rubble pile has its own provenance, so a warning can name the one changed pile.

Provenance has two facts. Each fact has one of three sources.

| Fact                 | An asset prompt                        | The designer, by hand                 | The agent, on a request with no stored prompt |
| -------------------- | -------------------------------------- | ------------------------------------- | --------------------------------------------- |
| **Made by**          | "Break up the floor with rubble piles" | The designer puts a goat in the room. | "Add a goat by the east wall."                |
| **Changed since by** | A later prompt that adjusts the thing  | A drag                                | "Move the platform to my right."              |

A request with no stored prompt cannot be applied again. For a reapply, it has the same effect as a hand edit.

Provenance applies to authored state only. A thing that is made during play has no provenance. It has a link to the thing in the authored state that made it. Example: a goat that appears after the first crossing links to the rule that made it appear, and that rule has provenance.

A change that the agent makes in a paused simulation gets provenance when it is written to the authored state.

A long chain of links between things that are made during play can make the first source slow to find. This is not a problem now, and no design exists for it.

### What a reapply affects (**Proposed**)

A reapply can affect three groups of things.

| Group                 | What is in it                                                                                                                            | Known from                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1. Made by the run    | The walls of the room, the gap, the iron ring                                                                                            | Provenance                 |
| 2. Depends on group 1 | Things that were put in the room later, and things attached to them or put in position against them                                      | Relations between entities |
| 3. Refers to group 1  | Exits from other rooms, expectations on the room, behaviors with prompts that name the ring, bookmarks and checks that start in the room | Links by ID                |

The agent can find all three groups only if provenance, declared relations, and IDs all exist.

Two kinds of reapply are possible. This area needs a brainstorm in milestone 4.

- **Refresh.** The agent replaces only the things that the run made. The subject of the prompt, such as the room, keeps its ID. A thing that is still there after the change keeps its ID.
- **Regenerate.** The agent makes the result again from the start.

The designer selects the kind, or the agent selects it from the change to the prompt.

### Managed execution of a prompt (**Proposed**)

This is a placeholder for a design. The agent does not only run an asset prompt. It manages the run. The work has these parts:

1. Select the kind of reapply.
2. Find what the run affects, in the three groups.
3. Show the designer what will change before it changes.
4. Keep the IDs of the things that stay.
5. Make the change.
6. Find the errors that the change caused, such as a thing in a position that is no longer correct or an expectation that fails.
7. Report those errors to the designer.

### Expectations

The idea of an expectation is agreed. The mechanism is not designed. The points below say what an expectation is for. They do not say how the agent checks one. See [#483](https://github.com/twin-digital/opus/issues/483).

An expectation states, in natural language, something that must stay true. It is stored with the thing it describes. Example on a room: "cannot cross the gap without the grapple".

- The agent checks a change against the expectations that the change can affect. It does this the way a tester does manual testing. (**Agreed**)
- The agent can turn an expectation into a deterministic automated test. (**Agreed**)
- The agent does not simulate the whole game with every power-up to find effects that no expectation covers. (**Agreed**)
- When the agent notices such an effect, it tells the designer as a remark and does not block the change. (**Proposed**)

## Subsystems

A product is assembled from subsystems. A **subsystem** is a part of a product that has one job. Wishem provides a subsystem itself, or a library provides it through an adapter. (**Agreed**)

- A **built-in subsystem** is a subsystem that Wishem provides. It is in every product. Examples: the storage for entities and components, and the storage for authored state, which holds the registry and the directives.
- Each product chooses its other subsystems. Examples: physics, the renderer, sound.

The **core** is the part of Wishem that is not a subsystem. It runs the simulations: it steps the subsystems, joins their parts into the live state, and keeps time and recordings.

There are three kinds of subsystem.

| Kind                 | What it does                                       | Examples                                     |
| -------------------- | -------------------------------------------------- | -------------------------------------------- |
| **Model subsystem**  | Holds state or rules.                              | Live state storage, authored scenes, physics |
| **Output subsystem** | Shows or plays a simulation.                       | Renderer, sound                              |
| **Input subsystem**  | Changes what the player does into recorded inputs. | Gamepad, keyboard, touch                     |

Output subsystems and input subsystems together are the **I/O subsystems**.

### Model subsystems

A model subsystem holds state or rules. A library that provides a model subsystem is a **model library**. It must pass the **model contract**:

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

### How the live state is composed (**Proposed**)

The live state of a simulation is a record with one key for each model subsystem. Each model subsystem contributes its part. The live state is the view over all the parts. A built-in model subsystem contributes its part in the same way as one that a library provides.

- A snapshot is the snapshot of each model subsystem, under the same keys.
- The registry reports each definition together with the model subsystem that owns it.
- A simulation passes the model contract when each model subsystem passes it.
- The entity is what joins the parts. The physics part and the state storage part refer to the same goat by one entity.

### I/O subsystems

An I/O subsystem connects a simulation to the player. It holds no state. (**Agreed**)

These rules apply (**Proposed**):

- **I/O rule.** A simulation gives the same result when an I/O subsystem is removed.
- **Output rule.** The agent can learn what an output subsystem showed or played. For a renderer this is a screenshot. For sound this is a record of the sounds that played.
- **Input rule.** Each thing that an input subsystem sends to a simulation is recorded. A recording or the agent can take the place of an input subsystem.

What an output subsystem holds is derived from the live state and can be built again from it at any time.

### The renderer contract

A renderer is an output subsystem with more requirements. It follows the **renderer contract**:

1. It draws from the live state of a simulation.
2. It gives a screenshot on request.
3. It maps a point on the screen back to the entity drawn there.
4. It draws tool overlays, such as a ring that shows a distance.

Item 3 is what resolves "the platform to my right" and a click to inspect.

The renderer keeps its own objects, such as sprites, layers, and draw order. Wishem does not define them. Example: in a 3/4 perspective the renderer sorts by y position, and the live state has no such order.

Under this contract a pixel-art game can pick PixiJS, a 3D game can pick Three.js, and a card game can pick plain HTML and CSS.

### Views (**Agreed**)

A renderer holds **views**. A view changes one component of an entity into the objects of that renderer.

- Each renderer provides its own component types. Wishem does not define one set of visual components for all renderers.
- A view is linked to its component type by the ID of the component type. A component type that has no view is not drawn.
- The props of a view are the fields of its component type.
- A view is a pure function of its props. A view holds no state.
- A renderer imports the model. The model never imports a renderer (rule R1).

A product has two sides (**Proposed**). The **model side** is the definitions, the behaviors, and the authored state. The **presentation side** is the views for one output subsystem. The presentation side is code of the product and is not part of the model. The I/O rule is the test: the model gives the same result when the output subsystem is removed. A workbench has the same two sides.

A component of a renderer can hold **transient state**. State is transient when all three of these things are true:

1. A reload of the page loses it with no harm to the designer.
2. No other part of the page, and no behavior, reads it.
3. The agent does not need it to know what the designer did.

Examples of transient state: hover, focus, the open state of a select, the scroll position, the caret, and text in a control before the designer commits it. The text in the prompt box is transient now.

Each other state is in the model. An event in a view sends an input or a write to the core.

Reason: the web browser holds focus, hover, the scroll position, and the caret, so no HTML renderer can put them in the model. The workbench has authored state only, so each value in the model is a write to a file.

### Adapters

An adapter connects a library to a subsystem. An adapter is written when a product first picks that library (rule R7). The first game pays for one adapter in each subsystem that a library provides.

A built-in subsystem needs no adapter. A library can replace a built-in subsystem through an adapter. Example: an ECS library as the storage for entities and components.

## Tools

The designer sees the product through tools: a view of the screen, an inspector, tables of the registered kinds, a world map. The workbench holds the tools. See the wireframe in `examples/`.

- Tools are built as the project needs them. Each project can have tools that only it uses. (**Agreed**)
- A table and an inspector for any registered kind are derived from its declaration. A hand-built panel is the exception. (**Proposed**)
- A toolkit exists so that the agent can add a tool without building an editor from nothing. (**Agreed** as an expected part of the base)

### Recognized names in text (**Proposed**)

The tools highlight each known name in text. This applies to directives, to the designer's messages, and to the agent's replies. It also applies while the designer types.

A name is known if it is in one of these sets:

- the names of things in the product, such as "goat" and "the Kiln"
- the kinds that the product registered, such as "status" and "item"
- the terms of Wishem, such as "expectation", "bookmark", and "reapply"

The highlight has these effects:

- **Confirmation.** The designer sees that a name refers to the intended thing.
- **A signal for a new thing.** A name with no highlight is not known. In "the goats stay docile until the shift whistle blows", no highlight on "shift whistle" shows that the agent must create it or ask about it.
- **A way to the thing.** The designer selects a highlight to open the thing that it names.

There are two levels of recognition. A match against the registry is immediate and needs no agent. After the agent reads the text, it confirms what each name refers to, and the tools show that the link is confirmed.

A highlight means that a name is known. It does not mean that the agent understood the sentence.

For a directive, the confirmed links are stored with the text. When a thing gets a new name, the agent can then update or report each directive that refers to it.
