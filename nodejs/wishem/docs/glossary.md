# Glossary

> Blueprint, not a specification. See `README.md` for the status labels.

Use one term for each concept. Use these exact terms in specifications and in code.

The designer sees only some of these terms. The agent and the tools use the terms for the things that a designer makes and does: behavior prompt, asset prompt, expectation, bookmark, reapply. The other terms are internal. With the designer, the agent uses the words of the product. Example: the agent says "the game" when the product is a game.

Terms in each group are in alphabetical order.

## People and roles

**Agent**: The AI that builds and changes the product for the designer. The designer can call it Wishem, 'shem, or 'shemmy.

**Designer**: The person who directs the product. The designer gives direction in natural language and does not need to read code.

**Owner**: The person who owns the Wishem project and confirms its decisions.

**Wishem**: The environment that a designer uses to make a project. Also the name of the agent.

## The project

**Model side** (**Proposed**): The definitions, the behaviors, and the authored state of a product or of a workbench. The model side is the model.

**Mount** (**Proposed**): To put the model of a product in the workbench construct. The product model is the store `product` of the workbench construct. The store validates it alone, and it refers to nothing of the workbench. A storage subsystem of its own keeps it.

**Presentation side** (**Proposed**): The views of a product or of a workbench for one output subsystem. The presentation side is code of the product. It is not part of the model.

**Product**: The part of a project that the designer ships. A product is a model. This is an internal term. With the designer, say the word for the kind of product, such as "the game".

**Product code** (**Proposed**): The module that holds the rules of a product in code. It exports the list `behaviors`, which holds the native behaviors of the product. The update subsystem of each product construct runs them. The designer names it with the option `--product-code` of the `start` script.

**Project**: What a designer makes with Wishem. A project has two parts: the product, and the workbench. The workbench holds one authored model, and that model contains the model of the product. The product knows nothing about the workbench.

**Workbench**: The part of a project that the designer uses to make the product. The workbench shows and changes the product. It holds the tools. A workbench is a model that is made with Wishem. It is not a game. The workbench runs as its own construct, and that construct does not hold the subsystems of the product.

## The model

**Authored state**: The things of a model that the designer or the agent makes and that Wishem keeps: rooms, entity definitions, prompts, expectations, assets. It is part of the model. The stores of the workbench construct hold it (`store` and `product`), and a storage subsystem keeps each one (**Proposed**).

**Behavior**: Something a component does during play. A behavior has a prompt, code, fields, checks, and a history.

**Component**: A declared set of fields with optional behavior, attached to an entity. Each component has a component type.

**Component type**: The declaration of a component: its label and its fields. The declaration is data (JSON), not code. A component type can have behaviors. A component type that only one entity uses is normal.

**Definitions**: The declared kinds in a model: component types, entity definitions, and relations. They say what can exist. The registry reports them.

**Entity**: A thing in a model. An entity is the set of its components. The components of one entity can be in different subsystems.

**Entity definition** (**Proposed**): The declaration of a kind of entity, such as "goat": its name and its component types.

**Event** (**Proposed**): Something that happens in a construct at one point in its time. A behavior can respond to an event. A construct can make a bookmark at an event. An event is not a hub event.

**Field**: One declared value in a component. A field has one of four types: `string`, `number`, `boolean`, or `reference`.

**ID** (**Agreed** for a component type, a field, and an entity): The name of a registered thing that code and links use. It does not change. It has a prefix for the kind of thing, an underscore, and a UUID in lowercase. Prefixes: `ct_` for a component type, `fld_` for a field, `e_` for an entity.

**Label** (**Agreed** for a component type and a field): The name of a registered thing that the designer sees. The designer can change it.

**Live state**: The joined state of one construct of a product. It is in memory. Its durable form is a checkpoint and the record (**Proposed**).

**Model**: The definitions, the behaviors, and the authored state of a product or of a workbench. The model subsystems of a construct hold the model. The hub does not hold it.

**Native behavior**: A behavior whose current version a person wrote by hand. It stays native until the designer gives it a new prompt. The count behavior (**Proposed**) of the sample product and the color behavior (**Proposed**) of the PixiJS construct are native behaviors in a first form. The update subsystem runs them. It stands in for the behavior feature (issue #481).

**Registry**: The part that reports the definitions. The agent queries it. The registry does not hold the things themselves. The things are in the authored state and the live state. The registry is not a job of the hub. The store holds it (**Proposed**).

**Relation**: A declared field of the type `reference`. Its value is the ID of an entity of the same model. Examples: a room contains an entity, and a held item is attached to the hero.

**State**: The authored state and the live state together.

## Time

**Bookmark**: A named point in a record. Rewind and replay use it as their target.

**Checkpoint** (**Proposed**): The joined state of a construct at one sequence number of the record. The hub keeps a checkpoint at the start of the record and after each input whose sequence number is a multiple of the checkpoint interval (default 100), and after each rewind. A checkpoint refers to the parts of the joined state and makes no copy.

**Clock**: An input subsystem that sends ticks at an interval. While `running` is true in the state of the `time` subsystem, the clock sends `time/advance` inputs (**Proposed**). A product that is not a game has no clock.

**Play session**: A construct with a player at the controls.

**Replay**: To apply a record to a new construct, with or without a changed value.

**Restore**: To load a checkpoint into a construct.

**Rewind**: To return a construct to an earlier point in its record. A rewind is the input `hub/rewind` with the target sequence number, and its hub event is `applied`. The hub restores the last checkpoint at or before the target and applies the record from there (**Proposed**).

**Snapshot**: The state of one model subsystem, saved as data. A model library that holds its own state makes a snapshot and restores it.

**Step** (**Proposed**): One `time/advance` input that is sent while the clock is paused.

**Tick** (**Agreed**): The input `time/advance`. A listener sees a tick as the hub event for an applied input. The type `Tick` (**Proposed**) of the package `update` holds the facts of one tick that a behavior gets: `ms`, `ticks`, and `now`.

**Time** (**Proposed**): The `time` subsystem. It is a model subsystem. Its state is the time of the construct, the count of ticks, and `running`. It declares the input types `time/advance` and `time/set-running`.

## Directives

**Asset prompt**: A prompt with a one-time effect that produces an asset.

**Behavior prompt**: The designer's description of a behavior. It is the source of the behavior.

**Directive**: Natural-language text from the designer that Wishem stores and keeps the product in agreement with. The three kinds are behavior prompt, asset prompt, and expectation. This is an internal term.

**Expectation**: Natural-language text from the designer that states something that must stay true. It is stored with the thing it describes. Example: "cannot cross the gap without the grapple".

## Generated things

**Asset**: A generated or imported thing that the product uses: a sprite, a room layout, a sound.

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

## Constructs and subsystems

**Adapter**: The code that connects a library to a subsystem.

**Built-in subsystem**: A subsystem that Wishem provides. It is in every product.

**Construct**: One hub and all its subsystems. A construct runs in one process or in more than one. Each running copy of a product is one construct, and the workbench runs as its own construct. The hub code is the same for each construct. This is an internal term. With the designer, say the word for the kind of product, such as "the game".

**Construct list** (**Proposed**): The model subsystem `constructs` of the workbench construct. It holds one entry for each product construct that must run: the wanted state, the status that the construct manager reported last, and the address of the link. A client changes it with the inputs `constructs/start`, `constructs/stop`, and `constructs/send`. Only the construct manager reports a status.

**Construct manager** (**Proposed**): The I/O part of the workbench construct that reads the construct list, starts each product construct in the process of the workbench, and gives it the product model. It sends each later change of the product model as inputs, passes inputs from a client to a product construct, and reports the status of each product construct. It has one job, and it attaches two subsystems: an output subsystem and an input subsystem. To a product construct, the construct manager is also an output subsystem and an input subsystem. Only the construct manager can rewind a product construct.

**Godot view** (**Proposed**): The kind of view that the Godot renderer runs, with a sidecar of the kind `godot`. A Godot view makes one node for each component of its component type. Rule R17 gives each renderer its own kind of view, as for the PixiJS view.

**Hub**: The part of a construct that connects the subsystems. Each subsystem communicates only with the hub. The hub joins the model data that the model subsystems hold, and gives that data to each subsystem that asks. The hub carries hub events, and it keeps the ordered record of inputs that rewind and replay use. A job belongs in the hub only if a subsystem cannot do it.

**Hub event** (**Proposed**): A message from the hub to each listener of a port. The hub events are few: the construct started, an input was applied, and the construct stops. A rewind is an applied input. No hub event exists for each change of a value.

**I/O subsystem**: An output subsystem or an input subsystem. An I/O subsystem holds no state. Each I/O subsystem can read the joined state and get the hub events (**Proposed**).

**Input** (**Proposed**): Data that a subsystem sends to the hub to change state: a type and a payload. The type has the form `<subsystem>/<name>`, such as `store/set-field` or `time/advance`. The hub gives each input a sequence number and records its source.

**Input subsystem**: A subsystem that sends inputs to the hub. Only an input subsystem can send an input (**Proposed**). Examples: gamepad, keyboard, the clock.

**Joined state** (**Proposed**): The state of a construct that the hub gives to a reader. It has one part for each model subsystem, under the key of that model subsystem. Each part is immutable.

**Link** (**Proposed**): The connection between the process of a hub and a process that does not hold that hub. One link carries the subsystems of one process. A link is a versioned protocol of JSON messages on a WebSocket.

**Model contract**: The four conditions a library must pass to provide a model subsystem.

**Model library**: A library that provides a model subsystem.

**Model subsystem**: A subsystem that gives the state and the rules of one part of the joined state. The part changes only when the hub applies an input, and the same inputs give the same state. A model subsystem is a pure function: it gets its part and an input, and it returns the new part. A model library that holds its own state is a second form (**Proposed**). Examples: the store, the `time` subsystem, physics.

**Output subsystem**: A subsystem that only reads. It shows or plays a construct. Examples: renderer, sound.

**PixiJS view** (**Proposed**): The kind of view that the PixiJS renderer runs: a file with a default export of `create` and `update`, and a sidecar of the kind `pixi`. A PixiJS view makes one display object for each component of its component type.

**Port** (**Proposed**): The interface that an I/O subsystem uses to communicate with the hub. A port has three operations: `submit(input)` sends an input, `read()` gets the joined state, and `subscribe(listener)` gets the hub events. Only an input subsystem can use `submit`. A model subsystem gets no port. In the process of the hub, a port is direct calls.

**Process**: A running thing that holds subsystems. Inside one process, a subsystem and a hub use direct calls. Between two processes, they use a link. A process has one language. A process holds zero or more hubs (**Proposed**).

**React view** (**Agreed**): The kind of view that the HTML renderer runs: a React component. A React view that has no sidecar is not attached to a component type.

**Record**: The start and the ordered list of the inputs of a construct after the start, which the hub keeps. The start is a checkpoint. Each input has the sequence number and the source (**Proposed**). The record has a limit (default 100000 inputs). When the list is longer, the hub moves the start to a checkpoint and removes the earlier inputs. Rewind and replay use the record.

**Remote port** (**Proposed**): The part that keeps the link to a hub, in a process that does not hold that hub. It gives the subsystems of that process the three operations of a port.

**Renderer contract**: The four things a renderer must do.

**Sidecar** (**Agreed**): A data file beside a view. It holds the kind of the view and the ID of its component type.

**Storage subsystem** (**Proposed**): The part that keeps the authored state. It has one job, and it attaches two subsystems. Its output subsystem writes each change to files. Its input subsystem sends an input when a file changes on the disk. No other part of Wishem knows that the authored state is in files.

**Store** (**Proposed**): The built-in model subsystem that holds the definitions and the entities. A write is an input to the store. The store holds the list of entities.

**Subsystem**: A part of a construct that has one job. Wishem provides it, or a library provides it through an adapter. A subsystem has one kind, and the hub knows the kind (**Proposed**).

**Update subsystem** (**Agreed**): The model subsystem that runs the behaviors at each tick. A construct has one update subsystem. The package `update` (**Proposed** name) provides it. At each tick, it runs the first behavior of its list for each entity that has the component type of the behavior, then the second behavior, and so on. Each write goes through the store. The first form runs native behaviors ([#617](https://github.com/twin-digital/opus/issues/617)).

**View** (**Agreed**): Code that a renderer runs to draw a component type. A view is content of the product, and it is not part of the renderer. Each renderer has its own kind of view. A view is a pure function of its props. A sidecar attaches a view to its component type.

## Tools

**Tool**: A part of the designer's view of the product: a screen view, an inspector, a table, an overlay.

## Planning

**Change**: A unit of work. A change is always an OpenSpec change. Each GitHub issue is planned as one change.

**Milestone**: One row of the roadmap, such as "Agent access". A milestone has one or more changes. It agrees with a GitHub milestone, such as "Wishem: Agent access".

## Terms that are not used

| Do not use                                                  | Use                                                                                                              | Reason                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrangement, instance, wheel, for a running copy of a model | Construct                                                                                                        | One word for the concept.                                                                                                                                        |
| Attachment interface                                        | Port                                                                                                             | A subsystem communicates with the hub through a port. No formal "attachment" object exists.                                                                      |
| Client and server                                           | The hub and the remote port, or the two sides of a link                                                          | A link carries a port between two processes. One side has the hub, and the other side has a remote port. See rule R17.                                           |
| Component, for React code                                   | View, or React view                                                                                              | A component is a part of an entity in a model.                                                                                                                   |
| Core                                                        | Hub, for the part that connects the subsystems. Store, for the part that holds the definitions and the entities. | "Core" has more than one meaning. The part that connects the subsystems does not hold the model. `core` is a current name in the code.                           |
| Designer statement                                          | Expectation                                                                                                      | One word for the concept.                                                                                                                                        |
| Engine, for Wishem as a whole                               | Wishem, or the model                                                                                             | No engine is built ahead of a product.                                                                                                                           |
| Folder, file, for where a model is stored                   | No term. Write "the authored model of the product".                                                              | Storage in files is the method of one storage subsystem. Only the text about a storage subsystem uses these words.                                               |
| Game model                                                  | Model                                                                                                            | A model is not always the model of a game. The workbench is a model, and it is not a game.                                                                       |
| Game state                                                  | State                                                                                                            | The state of a model is not always the state of a game.                                                                                                          |
| Game truth                                                  | State and rules                                                                                                  | Plain words for the same thing.                                                                                                                                  |
| Generation prompt                                           | Asset prompt                                                                                                     | Shorter, and it pairs with "behavior prompt".                                                                                                                    |
| Host                                                        | Process                                                                                                          | "Host" has more than one meaning: the running thing that holds subsystems, and the code that assembles a construct. `host-nodejs` is a current name in the code. |
| Invariant, constraint, requirement                          | Expectation                                                                                                      | An expectation can be soft. Games and physics libraries use "constraint" and "requirement" for other things.                                                     |
| Kernel, microkernel                                         | Hub                                                                                                              | In an operating system, a process runs on the kernel. Here, a process holds the hub.                                                                             |
| Origin record                                               | Provenance                                                                                                       | Provenance is the usual term for this record.                                                                                                                    |
| Presentation slot                                           | Output subsystem or input subsystem                                                                              | Input is not presentation.                                                                                                                                       |
| Project, for a row of the roadmap                           | Milestone                                                                                                        | A project is what a designer makes with Wishem. "Milestone" agrees with the GitHub milestones.                                                                   |
| Recording                                                   | Record                                                                                                           | One word for the concept. The record of the hub is also the record of changes with their sources.                                                                |
| Rerun                                                       | Replay                                                                                                           | One word for the concept.                                                                                                                                        |
| Runtime, cell, island, for the thing that holds subsystems  | Process                                                                                                          | One word for the concept.                                                                                                                                        |
| Scene graph                                                 | Model, or the renderer's objects                                                                                 | Use "model" for entities and components. Use "the renderer's objects" for the display side.                                                                      |
| Script                                                      | Behavior                                                                                                         | The prompt is the source, not a script.                                                                                                                          |
| Simulation, sim                                             | Construct                                                                                                        | An agent helps the designer make a simulation as a product, so the word has a second meaning.                                                                    |
| Slot                                                        | Subsystem                                                                                                        | Games use "slot" for equipment and saved games.                                                                                                                  |
| Stored words                                                | Directive                                                                                                        | Internal term for the three kinds together.                                                                                                                      |
| Subject, for what a workbench shows and changes             | No term. Write "the workbench shows and changes the product".                                                    | The sentence gives the relation in plain words. A second term for the product is not necessary.                                                                  |
| Truth slot, truth library, truth contract                   | Model subsystem, model library, model contract                                                                   | Plain words for the same things.                                                                                                                                 |
