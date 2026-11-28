# Concepts

> Blueprint, not a specification. See `README.md` for the status labels. Terms are defined in `glossary.md`.

This file gives the design. `architecture/README.md` gives what the code does now.

The examples in this file use the quarry room from `examples/interactions.md`. That room has a gap that the player crosses with a grapple, two goats, and a shift whistle.

## The project (**Agreed**)

A **project** is what a designer makes with Wishem. It has two parts:

- the **product**: the part that the designer ships.
- the **workbench**: the part that the designer uses to make the product.

The workbench holds one authored model. That model contains the model of the product. The product knows nothing about the workbench.

The workbench is a model that is made with Wishem. It is not a game. The workbench shows and changes the product. See "Workbench and product".

"Product" is an internal term. With the designer, the agent says the word for the kind of product, such as "the game".

## The model

The **model** has three parts:

- the **definitions**: the declared kinds, such as component types, entity definitions, and relations. They say what can exist.
- the behaviors: the code that changes state during play.
- the authored state: the things that the designer or the agent makes and that Wishem keeps. A construct of a product starts from them.

A **construct** is one hub and all its subsystems. It is the structure that a product has while it runs. Each running copy of a product is one construct. (**Agreed**)

The model is not a property of the hub. The model subsystems of a construct hold the model. (**Agreed**)

More than one construct of the same model can run at the same time. The designer plays in one construct while the agent runs others, for example to replay a jump or to do checks. Each one is a full construct with its own live state and its own record. The constructs have different sets of subsystems. (**Agreed**)

A construct can run with no window.

"Construct" is an internal term. With the designer, the agent says the word for the kind of product, such as "the game".

A renderer draws a picture of the live state of a construct and owns none of that state.

### Entities and components (**Agreed**)

- An **entity** is a thing in a model: the hero, a goat, an iron ring, a door.
- A **component** is a declared set of fields with optional behavior. An entity is the set of its components.
- A **component type** is the declaration of a component: its label and its fields. The declaration is data in the model, not code. A component type can have behaviors.
- Each component has a component type. No component exists without a type. A component type that only one entity uses is normal.

This is the model that Unity developers know: game objects with attached components that carry state and behavior. Making a game is mostly the work of creating and managing the correct components. That is also the work of the agent.

The entity and component model is the language that the agent speaks. It is the same in every product (rule R5). What stores the entities and components is a built-in subsystem. See "Storage".

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

The registry is not a job of the hub. A subsystem holds it: the store. (**Proposed**)

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

- **Authored state** is the part of the model that the designer or the agent makes and that Wishem keeps: rooms, entity definitions, prompts, expectations, assets.
- **Live state** is the joined state of one construct of a product. A construct makes its live state from the authored state when it starts.

"State" means the authored state and the live state together.

A change that the agent makes in a paused construct is also made in the authored state, so that the change is still there the next day.

"Storage" says what holds each state and what keeps it.

## Constructs and subsystems

A construct is assembled from one hub and subsystems. A **subsystem** is a part of a construct that has one job. Wishem provides a subsystem itself, or a library provides it through an adapter. (**Agreed**)

- A **built-in subsystem** is a subsystem that Wishem provides. It is in every product. Example: the store, which holds the definitions and the entities.
- Each product chooses its other subsystems. Examples: physics, the renderer, sound.

### The hub (**Agreed**)

The **hub** is the part of a construct that connects the subsystems.

- The hub knows each subsystem.
- A subsystem communicates only with the hub. A subsystem does not address a different subsystem (rule R20).
- The hub joins the model data that the model subsystems hold. It gives that data to each subsystem that asks.
- The hub carries hub events. The hub events are few, because a hub event for each change costs too much in a game.
- The hub keeps the ordered record of inputs that rewind and replay use.
- A job belongs in the hub only if a subsystem cannot do it.

The hub code is the same TypeScript code for each construct. A workbench construct and a product construct have the same hub code and different subsystems. (**Proposed**)

### Kinds of subsystem

A subsystem has one kind. The hub knows the kind. (**Proposed**)

| Kind                 | What it does                                                                                                        | Examples                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Model subsystem**  | Gives the state and the rules of one part of the joined state. The part changes only when the hub applies an input. | The store, the `time` subsystem, physics |
| **Input subsystem**  | Sends inputs to the hub.                                                                                            | Gamepad, keyboard, touch, the clock      |
| **Output subsystem** | Only reads. It shows or plays a construct.                                                                          | Renderer, sound                          |

Output subsystems and input subsystems together are the **I/O subsystems**.

### The port

A subsystem has three operations on the hub: send an input, read the joined state, and get the hub events. A subsystem has no way to ask a different subsystem to do something. (**Agreed**)

Control is state. Example: pause is an input that sets `running` in the `time` part of the joined state, and the clock reads `running`. (**Agreed**)

An I/O subsystem uses the three operations through a **port** (**Proposed**):

| Operation             | Meaning               | Which subsystem can use it |
| --------------------- | --------------------- | -------------------------- |
| `submit(input)`       | Send an input.        | An input subsystem only    |
| `read()`              | Get the joined state. | Each I/O subsystem         |
| `subscribe(listener)` | Get the hub events.   | Each I/O subsystem         |

These items are **Proposed**:

- A model subsystem gets no port. It cannot send an input.
- A part that draws and also sends, such as a page with a form, attaches two subsystems: one output subsystem and one input subsystem.
- A part that reads and also sends for one job, such as the storage subsystem or the construct manager, also attaches two subsystems: one output subsystem and one input subsystem.

A request with a reply through the hub is a possible later addition. (**Agreed**) It is for a query of an output subsystem, such as a screenshot. It is not for control. See "The renderer contract". (**Proposed**)

### Model subsystems

A model subsystem gives state or rules. It has one of two forms. (**Proposed**)

- **A pure function.** The model subsystem gets its part of the state and an input, and it returns the new part. The hub holds the parts. A part that did not change is the same object.
- **A model library that holds its own state.** The model subsystem makes a snapshot of its state and restores it. The design of this form is **Open**. See [#574](https://github.com/twin-digital/opus/issues/574).

A model subsystem declares the types of input that it applies. It can read the joined state while it applies an input. (**Proposed**)

A library that provides a model subsystem is a **model library**. It must pass the **model contract**:

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

### I/O subsystems

An I/O subsystem holds no state. (**Agreed**)

An I/O subsystem connects a construct to something that is not a model subsystem. Examples: the player, real time, the disk, a different construct.

These rules apply (**Proposed**):

- **I/O rule.** A construct gives the same result from the same record when an I/O subsystem is removed.
- **Output rule.** The agent can learn what an output subsystem showed or played. For a renderer this is a screenshot. For sound this is a record of the sounds that played.
- **Input rule.** Each input that an input subsystem sends is in the record. A record or the agent can take the place of an input subsystem.

The control of an I/O subsystem is also state. That state is in a part of the joined state. An input changes it, and the I/O subsystem reads it. (**Agreed**)

What an output subsystem holds is derived from the live state and can be built again from it at any time.

## Inputs and the record

An **input** is data: a type and a payload. The type has the form `<subsystem>/<name>`. Examples: `store/set-field` and `time/advance`. (**Proposed**)

The hub does these things with each input (**Proposed**):

1. The hub rejects an input when no model subsystem declares its type.
2. The hub gives the input a sequence number and records the source of the input.
3. The hub appends the input to the **record**.
4. The hub gives the input to each model subsystem that declares the type, in the order of registration.

The record is a record of inputs. It is not a record of each change of a value. (**Proposed**)

The record has a start and a list of inputs. The start is a checkpoint: the joined state after one sequence number. For a new hub, the start is the sequence number 0 and the first joined state. The hub keeps a checkpoint at the start and after each input whose sequence number is a multiple of the checkpoint interval (default 100), and after each rewind. A checkpoint refers to the parts and makes no copy. (**Proposed**)

The record has a limit (default 100000 inputs after the start). When the list is longer, the hub moves the start to a checkpoint and removes the earlier inputs and checkpoints. (**Proposed**)

The ID `hub` and the input types `hub/<name>` belong to the hub. No model subsystem or I/O subsystem uses them. (**Proposed**)

A write from the workbench or from the agent is an input. Thus the record is also the record of changes with their sources, which provenance and undo need. (**Proposed**)

## Joined state and hub events

The **joined state** is the state of a construct that the hub gives to a reader. It has one part for each model subsystem, under the key of that model subsystem. (**Proposed**)

- The hub holds the parts. Each part is immutable. A part that did not change is the same object. (**Proposed**)
- A reader in the process of the hub gets the parts with no copy. Thus a renderer can read the joined state on each frame. (**Proposed**)
- Hub events do not carry the state. A subsystem that needs the state reads it. (**Proposed**)

The hub has these hub events (**Proposed**):

- The construct started.
- An input was applied. The hub event has the sequence number and the type of the input. A rewind is an applied input of the type `hub/rewind`.
- The construct stops.

The hub has no hub event for each change of a value.

### How the live state is composed (**Proposed**)

The live state of a construct is its joined state. Each model subsystem contributes its part. A built-in model subsystem contributes its part in the same way as one that a library provides.

- A checkpoint is the joined state at one sequence number of the record. The hub keeps it. For a model subsystem that is a pure function, the checkpoint refers to the part and makes no copy.
- The registry reports each definition together with the model subsystem that owns it.
- A construct passes the model contract when each model subsystem passes it.
- The entity is what joins the parts. The physics part and the store part refer to the same goat by one entity ID.
- The source of the input that makes an entity supplies the entity ID. Thus a replay gives the same ID.
- The store holds the list of entities. No part of the hub knows an entity.

## Time

Each input is in the record. The same starting state and the same inputs always give the same result. Random values come from a seed. (rule R3)

The **clock** is a subsystem that sends ticks at an interval. A product that is not a game has no clock. (**Agreed**)

A tick is the input `time/advance`. A listener sees a tick as the hub event for an applied input. (**Agreed**)

A construct that has no clock has the record, rewind, and replay. (**Proposed**)

Time has two subsystems (**Proposed**):

- `time` is a model subsystem. Its state is the time of the construct, the count of ticks, and `running`. It declares the input types `time/advance` and `time/set-running`.
- The clock is an input subsystem. While `running` is true, the clock sends `time/advance` at an interval.

These operations follow from the record and the two subsystems (**Proposed**):

| Operation         | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Pause**, resume | Send `time/set-running`.                                                                                       |
| **Step**          | Send one `time/advance` while the clock is paused.                                                             |
| **Snapshot**      | A model library that holds its own state saves that state as data.                                             |
| **Checkpoint**    | The hub keeps the joined state at one sequence number of the record.                                           |
| **Restore**       | Load a checkpoint into a construct.                                                                            |
| **Rewind**        | Restore the last checkpoint at or before the target, then apply the record from that checkpoint to the target. |
| **Replay**        | Apply a record to a new construct, with or without a changed value. The hub option `record` does it.           |
| **Bookmark**      | Give a name to a point in a record.                                                                            |

The agent sends `time/advance` inputs to run a construct faster than real time. (**Proposed**)

A replay with a changed value answers a question such as "would I have made the jump".

### Bookmarks (**Agreed**)

A **bookmark** is a named point in a record. Rewind and replay use a bookmark as their target.

A bookmark gives the designer and the agent a shared name for a moment, in the way that an entity name gives them a shared name for a thing:

- "Go back to when I entered the room."
- "Replay from where I picked up the grapple, with the higher jump."

A construct makes bookmarks automatically at registered events. Examples:

- the player enters a room
- the player gets an item or an ability
- the player takes damage or fails
- the designer pauses the construct
- the agent makes a change: one bookmark before the change and one after it
- a check of an expectation fails

Each product registers its own events, so each product has its own automatic bookmarks.

A bookmark has more uses:

- **Play from here.** The designer starts play at a bookmark.
- **A start for a check.** A check of "cannot cross the gap without the grapple" starts from a bookmark at the edge of the gap.
- **A report.** "It breaks here" is a bookmark that the agent can open.

A bookmark inside one play session is simple. A bookmark that is kept for a long time is not, because the product changes. See [#479](https://github.com/twin-digital/opus/issues/479).

## Storage

The text that defines Wishem does not say "folder" or "file" for where a model is stored. Storage in files is the method of one storage subsystem. (**Agreed**)

These items are **Proposed**:

- The **store** is the built-in model subsystem that holds the definitions and the entities. A write is an input to the store. The package `core` holds the code of the store. `core` is a current name in the code.
- The authored state is the state of the stores of the workbench construct. A storage subsystem keeps each store.
- A **storage subsystem** keeps the authored state. It has one job, and it attaches two subsystems. Its output subsystem writes each change to files. Its input subsystem sends an input when a file changes on the disk. Only the storage subsystem knows that the authored state is in files.
- The live state is the joined state of a product construct. The store of that construct starts from the authored model that the workbench gives to the construct.
- The live state is in memory. Its durable form is a checkpoint and the record.

## Processes and links

A **process** is a running thing that holds subsystems. (**Agreed**)

- A process has one language. Example: a hub in a Node.js process, and a renderer and physics in a Godot process. (**Agreed**)
- A construct runs in one process or in more than one. (**Agreed**)
- Inside one process, a subsystem and the hub use direct calls. Between two processes, they use a connection. (**Agreed**)
- A process holds zero or more hubs. Example: fifty previews of a sprite are fifty small constructs in one process. A page that holds only a renderer has no hub. (**Proposed**)

These items are **Proposed**:

- In the process of the hub, a port is direct calls.
- Between processes, a **link** carries a port. A link is a versioned protocol of JSON messages on a WebSocket.
- One link carries the subsystems of one process.
- The side of the hub sends the joined state at the start. With each hub event, it sends the parts that changed. The other side sends inputs.
- A process that does not hold that hub holds a **remote port**. The remote port keeps the link, and it gives the subsystems of that process the three operations of a port.
- A remote port exists in TypeScript, for a page in a web browser, and in GDScript, for Godot.
- A model subsystem in a process that does not hold that hub must apply each input and confirm it before the hub continues. The protocol reserves the messages for this case. The design has no such model subsystem.
- Two subsystems in one process that does not hold that hub can share data that is derived from the joined state. State that is not derived goes through the hub, as a part of a model subsystem.

## Workbench and product

The workbench is its own construct. It does not hold the subsystems of the product. (**Agreed**)

These items are **Proposed**:

- The workbench construct has the store `store` for the model of the workbench. It has the store `product` for the **mounted** product. The store `product` validates the product model alone, and the product model refers to nothing of the workbench.
- The workbench construct has a model subsystem that holds the list of the product constructs that must run.
- The workbench construct has the **construct manager**, which reads the list. The construct manager has one job, and it attaches two subsystems: an output subsystem that reads, and an input subsystem that sends. The construct manager does these things:
  - It starts and stops the product constructs.
  - It gives each product construct the product model.
  - It sends each later change of the product model to the product construct as an input.
  - It reports the status of each product construct to the workbench hub as inputs.
- To a product construct, the construct manager is also an output subsystem and an input subsystem. A hub does not connect to a hub.
- The agent connects to the workbench construct through a link.
- The workbench construct has no clock. It has the record, so it has undo and rewind.

## Renderers

### The renderer contract

A renderer is an output subsystem with more requirements. It follows the **renderer contract**:

1. It draws from the live state of a construct.
2. It gives a screenshot on request.
3. It maps a point on the screen back to the entity drawn there.
4. It draws tool overlays, such as a ring that shows a distance.

Item 3 is what resolves "the platform to my right" and a click to inspect.

Items 2 and 3 are requests that need a reply. They have no path through the hub. (**Proposed**) A request with a reply through the hub is a possible later addition. (**Agreed**)

The renderer keeps its own objects, such as sprites, layers, and draw order. Wishem does not define them. Example: in a 3/4 perspective the renderer sorts by y position, and the live state has no such order.

Under this contract a pixel-art game can pick PixiJS, a 3D game can pick Three.js, and a card game can pick plain HTML and CSS.

### The three renderers

Wishem has three renderers: the React renderer, the PixiJS renderer, and the Godot renderer. The three renderers use the same TypeScript hub (rule R17). (**Agreed**)

- Each renderer reads the hub through a port. The Godot renderer uses a remote port in GDScript. (**Proposed**)
- The React renderer is the package `renderer-react`. It runs React views and reads a port. The page gives the port. (**Proposed**) The requirements of the package are in `wishem/renderer-html/renderer`.
- The PixiJS renderer and the Godot renderer each have one view. (**Agreed**)
- The PixiJS renderer is the package `renderer-pixi`. Its view is the PixiJS view (sidecar kind `pixi`). The package `pixi-page` holds a construct with a clock in a Node.js process, and a page that reads it through a link. (**Proposed**)
- The view of the PixiJS renderer is `ClearColor`. The view of the Godot renderer is the same. Each clears the viewport to a color that a field gives. (**Proposed**)
- The proof that a renderer works is a screenshot that changes when the clock advances. (**Proposed**)

### Views (**Agreed**)

A **view** is content of the product. A renderer supplies the code that loads, mounts, and runs views.

- Each renderer provides its own kind of view. Wishem does not define one set of visual components for all renderers.
- A view has the shape of a behavior: code that is attached to a component type, with the fields of the component as its inputs. A view is not a behavior: a renderer runs a view, the hub never loads it, and a view changes no state.
- A sidecar attaches a view to its component type by the ID of the component type. A component type that has no view is not drawn.
- The fields in the component type definition are the source. The types of the props of a view are generated.
- A view gets the fields of its own component type. When the same data needs more than one view, the data is in one component type, and each view has its own component type with a field that refers to the data. References are **Open**.
- A view is a pure function of its props. A view holds no state.
- A renderer imports the model. The model never imports a renderer (rule R1).

The views of a product are with the product, in one folder for each renderer. (**Proposed**)

A product has two sides (**Proposed**). The **model side** is the definitions, the behaviors, and the authored state. The **presentation side** is the views for one output subsystem. The presentation side is code of the product and is not part of the model. The I/O rule is the test: the model gives the same result when the output subsystem is removed. A workbench has the same two sides.

A component of a renderer can hold **transient state**. State is transient when all three of these things are true:

1. A reload of the page loses it with no harm to the designer.
2. No other part of the page, and no behavior, reads it.
3. The agent does not need it to know what the designer did.

Examples of transient state: hover, focus, the open state of a select, the scroll position, the caret, and text in a control before the designer commits it. The text in the prompt box is transient now.

Each other state is in the model. An event in a view sends an input to the hub.

Reason: the web browser holds focus, hover, the scroll position, and the caret, so no HTML renderer can put them in the model. Each change of a value in the store of the workbench is an input, and the storage subsystem writes it.

### Adapters

An adapter connects a library to a subsystem. An adapter is written when a product first picks that library (rule R7). The first game pays for one adapter in each subsystem that a library provides. The PixiJS renderer and the Godot renderer are the exception that rule R7 gives.

A built-in subsystem needs no adapter. A library can replace a built-in subsystem through an adapter. Example: an ECS library as the store.

## Distribution

- A product is distributed as a build that holds the hub, the subsystems, the model, and the page. (**Proposed**)
- For the MVP, the hub of each construct is in a Node.js process, and each renderer reads it through a link. (**Agreed**, owner, 2026-11-27)
- The workbench is distributed as an archive on a GitHub release. (**Proposed**)
- No package of Wishem is published to npm unless the owner agrees. (**Agreed**)
- The licence and the release channel are **Open**.

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

The count rule of the sample product is a native behavior in a first form. It stands in for the behavior feature (issue #481).

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

A change that the agent makes in a paused construct gets provenance when it is written to the authored state.

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
