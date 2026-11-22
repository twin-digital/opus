# Brainstorm minutes

> Minutes of the conversation of 2026-11-22 that produced this blueprint. They show how the design reached its shape. The other files hold the result.
>
> **Participants:** the owner of the project, and an AI agent as brainstorm partner ("the partner"). The partner is not Wishem's agent.

## 0. Starting point

The owner brought notes from an earlier conversation with another agent. The notes covered four questions:

1. **Do MCP servers exist for game engines?** Yes for editors (Unity, Unreal, Godot, Blender, Roblox). Runtime use is thin. The most useful thing a game can give an agent is structured state and reproducible seeds, not pixels.
2. **How to build a top-down adventure with generic engine and AI tooling?** The notes described an "agent-first" engine: deterministic simulation, a mode with no window, state as data, content as validated data, and a live devtools protocol.
3. **Can the AI and data layer be TypeScript with a client in any engine?** The notes described a client and server model in which the simulation owns every rule and the client only presents.
4. **What does the protocol between them need?** The notes studied client levels, latency, bandwidth for each genre, three state modes, and a comparison with Colyseus.

The partner observed that the notes describe three different things: a game, an agent-first engine, and a genre-agnostic protocol. The protocol is the expensive part, and a local single-player game needs little of it.

## 1. The product is the framework

- The owner wants to build the agent-powered framework. The game is "an incidental first user".
- The partner pointed out the cost of "any engine as client": a developer in Unity or Godot gives up the engine's physics, collision, and scripting, and keeps only a renderer.
- The owner confirmed TypeScript and accepted that many people do not want to build games in it.
- The owner doubts that an existing engine allows the deep integration that is wanted, because it was not built for an agent from the beginning.
- The owner stated the goal: to "speak a game into existence" through an agent that is integrated with the engine.

**Outcomes:**

- If the agent writes the game, the language is mostly the agent's concern.
- The doubt about existing engines is the reason to own the game model.
- "Agnostic" can mean that the renderer is replaceable. It does not have to mean "bring your Unity project".

## 2. What speaking a game looks like

- The owner could not describe the first moment of a project, and gave an example from a project that already has content: a request for a new forest screen east of the Water Palace, with a generated golden tree in the center, scattered trees, and Elf Ghosts.
- The partner read five needs from it: a world with named places, biomes as a concept, a catalog of things, placement by intent, and asset generation inside the conversation.
- The partner asked about a request that needs concepts that do not exist: ghosts that stay invisible until the player plays a flute near the golden tree.
- The owner described the expected steps: the agent adds a status and learns its mechanics from the engine, creates a flute item, asks about art and source, suggests a distance, and builds a behavior.

**Outcomes:**

- Asset generation is a core part.
- The agent does not only arrange existing pieces. It extends the game's vocabulary.

## 3. What the designer sees

- The owner expects a rendering of the game as in the Unity editor, with inspection of entities and a database view of statuses, items, and triggers.
- The partner showed a wireframe of an editor after the flute request: a conversation panel, a view of the screen, an inspector, a world map, and tables of the registered kinds.
- The owner did not comment on the details of the wireframe.

## 4. Self-construction

- The owner noted that the complexity is high and changed the approach.
- The owner wants to dogfood toward the editor and the conversation that were described, and to start with no engine and no editor.
- The engine is to "self-construct": it builds a model as features are needed to support a design.
- The tools and editor panels are built in the same way.
- Each game can have its own model and its own tools.
- Asked what exists at the start of a second, different game, the owner listed: a scene graph, primitives for input, sound, and graphics, resource loading, animation, asset and behavior generation, and a toolkit for developer tools. A toolkit for in-game user interface is possible and not decided.

**Outcome:** the product is not an engine or an editor built ahead of need. The partner proposed that the product is what exists at minute zero and the method by which the agent grows things.

## 5. Off-the-shelf libraries and the agent

- The partner proposed to take scene graph, input, sound, graphics, loading, and animation from PixiJS or Phaser, and said that nothing about them needs to be agent-aware.
- The partner offered three options for engine independence:
  - A. One renderer. The game logic imports nothing from it and runs with no window.
  - B. A wire protocol between the model and the renderer from the first day.
  - C. Start as A. Extract a protocol later if a second engine is wanted.
- The owner accepted C.
- The owner rejected the claim about agent awareness. The agent must speak the game's language natively. Two examples: after a missed jump, "make the player jump height high enough so I would have made this"; and "move the platform to my right so I wouldn't have fallen".
- The owner accepts off-the-shelf libraries only if everything in them can be exposed properly to the agent.

**Outcome:** the line moved. Anything that holds truth about the game must be native to the agent. Anything that only draws that truth can come off the shelf.

## 6. Designer statements

- The partner asked what happens when a jump change breaks a gap in a distant room that was meant to need the hookshot.
- The owner was not sure. The owner does not want the agent to simulate every gap in the game with every power-up, because the agent does not know the intent.
- The owner proposed expected invariants as part of a scene: requirements in natural language, such as "cannot cross without hookshot", that the designer adds to a room.
- The agent uses the statements for manual cross-checks of its changes, and can build deterministic automated tests from them.
- The owner confirmed the stage: dogfood first. The project can stay personal. It can become a product later if it proves useful.

## 7. Truth libraries and slots

- The owner asked two questions. Can off-the-shelf physics and scene graphs be adopted if the agent knows them natively? Can adapters under a native model give engine portability?
- The partner separated "the agent knows the API" from "the library hands over its state", and proposed four tests for a library that holds truth.
- The partner sorted adapters into three kinds:
  - renderer adapters: a safe choice
  - one interface over many truth libraries: a trap, because the same value gives different results in each engine
  - export to another engine: possible, costly, later
- The partner proposed that each game picks its own truth libraries. The owner liked this and asked if the renderer can get the same choice.
- The partner answered yes, under a lighter contract, and described two classes of slot.

**Outcome:** the owner accepted the shape: a fixed core, truth slots, and presentation slots.

## 8. Entities and components

- The owner corrected the partner's narrow reading of "scene graph". The owner meant entities with attached components that carry behavior and state, as in Unity. Most of the work on a game is creating and managing the correct components.
- The partner answered that this is the center of the plan and cannot be a slot.
- The partner proposed the entity and component model as the fixed core, with one rule that Unity does not have: all state lives in declared fields.
- The partner asked what a behavior is made of: code, or rules as data.

**Outcome:** the owner did not confirm the proposal about the fixed core. The discussion moved to behaviors.

## 9. Prompt-first behaviors

- The owner wants natural-language behaviors. Where a traditional editor has a code editor with a function, there is a text area with the designer's prompt. The agent writes the function behind it.
- A function that does not do what the prompt requires is a bug, and the function changes.
- If the code is right and the designer does not like it, the designer changes the prompt or adds to it.
- The history of prompts is stored with the component and can be viewed over time.
- A person can view and edit the code. That probably turns the behavior into a "native" behavior with a locked prompt.
- The owner expects the same idea to apply to asset generators: the inputs to the agent are first-class data, stored with the output.
- The partner added four proposals: kept output, fields from answers, checks, and names as links. The owner did not respond to them.

**Outcome:** the designer's words are the source. Code and assets are derived from them.

## 10. Generation prompts and hand edits

- The partner asked if a drag of one scattered tree locks the room's prompt.
- The owner separated design-time placement from random map generation during play. A placement prompt has a one-time effect and does not create a function that runs again and again.
- First option: the designer revises the prompt, for example "no trees in this area", and selects reapply. This means that the agent tracks everything a run produced, so that the result can be replaced. The owner noted a risk of conflicts.
- Drag and drop must also be supported. After a drag, nothing else happens.
- Writing the drag back into the prompt is brittle, because the reason for the move is not obvious.
- On a reapply, the agent compares the current state with what it produced and warns before it removes a changed thing.
- The owner's conclusion: prompts that seed a map are asset-generating prompts, the same as prompts that make sprites. The effect is one-time and can be run again. Hand edits are lost on regeneration unless the prompt is updated, and the system warns. A prompt is always stored with its result.

## 11. Size and the first project

- The partner divided the work into six projects and one parked project. The owner agreed.
- The owner added a project to do first: architecture documents that capture the vision, concepts, key terms, mockups, expected interactions with examples, and the roadmap. The documents guide and constrain future agents and are the starting point for the brainstorm of each later project.

**Decisions about that project:**

- An earlier game is a throwaway prototype. The first game is built from scratch. Art is likely to move. Code and workflows do not.
- Wishem is a product inside the opus repository, not a new repository.
- OpenSpec is used for planning and for formal specifications. The architecture documents are a blueprint for future specifications and are not specifications.
- The blueprint is one file for each purpose, in `nodejs/wishem/docs/`.
- Minutes of the brainstorm are part of it. This file is the minutes.

## 12. The name

Candidates were checked on 2026-11-22 against the npm registry, GitHub account names, domain resolution, and a US web search. Trademarks were not checked.

| Name                          | Result                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| wishem                        | No product, package, or account found. Wishew, an iOS app, is one letter away. |
| shemloop, boonloop, enchante  | Nothing found.                                                                 |
| spelloop, charmloop           | Minor uses: a game-jam game and a small studio; held domains.                  |
| incant, numen, egeria         | In use by small or unrelated software projects.                                |
| daimon, ghostwright, runeloop | In use by AI agent projects or a game with the exact name.                     |
| bespoke, sayso, voila         | Established products, two of them in AI.                                       |

**Decision:** the owner chose "wishem" as the working name.

- The main meaning is "wish 'em": a tool that lets designers wish game elements into existence.
- The origin story can mention the golem legend, in which a shem is the word that animates a golem.
- Wishem is also the name of the agent. Short forms are 'shem and 'shemmy.

## Not covered

- The order of the roadmap projects. The partner planned to lay out options, and the naming discussion came first.
- The first minute of an empty project.
- Where the conversation with the agent happens.
- Sound and music.
- Most of the protocol study in the starting notes. It belongs to the parked project 7.
