# Vision

> Blueprint, not a specification. See `README.md` for the status labels.

## What Wishem is

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe.

The designer gives direction in the words of a designer:

> "I need a room between the Weighbridge and the Kiln that teaches the grapple before the player needs it under pressure. Quarry biome. One cut too wide to jump, with an iron ring bolted to the far wall in plain view: generate the ring so it reads as something you can hook. No enemies until the player has crossed. After that, two goats, so the second crossing happens with something chasing."

The agent does the work. It creates the room, sizes the cut, generates the ring, and sets the goats to appear after the first crossing. The designer sees the result in the running game.

The goal in one phrase: to "speak a game into existence" through an agent that is integrated with the engine.

## What Wishem does

- **Develops the game model as it is needed.** The agent adds a concept, such as a status or an item, when a design first needs it.
- **Writes behaviors from natural language.** The designer describes what a thing does. The agent writes the code behind the description and keeps the two in agreement.
- **Generates the assets that the model defines.** These are sprites, room layouts, maps, and each other kind of content that the game has. Each asset is stored with the prompt that made it.
- **Creates the tools to see and change the model.** Inspectors, tables, and overlays appear when the game has something for them to show.
- **Adjusts, observes, and queries the model and the game state from inside the running game.** The agent can also rewind play and run it again with a changed value.
- **Automates tests and checks design constraints that are written in natural language.** The agent checks each change against the constraints that the designer wrote.

## What makes it different

**The agent speaks the game's own model.** Existing engine integrations let an agent operate an editor that was made for human hands. In Wishem the agent reads and changes scenes, entities, components, rules, physics values, and play history directly.

**The agent can reason about what happened.** A designer can pause after a missed jump and say "make the player jump height high enough so I would have made this". The agent has the recorded inputs and the game state. It can run the same inputs again with a new value and see the result.

**The designer's words are the source.** A behavior is stored as the prompt that describes it. The agent writes the function behind the prompt. A generated sprite or room layout is stored with the prompt that produced it. Designer statements such as "cannot cross the cut without the grapple" are stored with the room they describe.

**The engine and the tools grow with the game.** Wishem starts nearly empty. A concept such as "status" appears when a design first needs it. An editor panel such as a list of statuses appears when statuses exist. Each game can end with its own model and its own tools.

## Who uses it

- **The designer.** A person who directs the game. The designer does not need to read code.
- **The agent.** The designer calls the agent Wishem, 'shem, or 'shemmy.

The first designers are the owner of the project and a young collaborator.

## What Wishem is not

- It is not a general game engine that is built in full before a game uses it.
- It is not a layer on top of Unity, Godot, or another engine. Wishem owns the game model.
- It is not a tool that drives an existing editor through that editor's user interface.
- It is not a runtime feature for players. Agent-driven characters or hints inside a shipped game are outside the current scope.

## Stage

Wishem is a personal project. The plan is to use it to build a real game first. If it proves useful, it can become a product later.

The first game is a top-down adventure in a 3/4 perspective and a 16-bit console style. See `roadmap.md`.

## Technology

- Wishem is written in TypeScript. (**Agreed**)
- The agent writes most of the game code, so the language is mainly the agent's concern. The designer reads little of it. (**Proposed**)

## The name

"Wishem" reads as "wish 'em": the designer wishes game elements into existence. This is the main meaning.

The name also contains _shem_. This second meaning is hidden. In golem folklore, a shem is a word that is placed in a golem and brings it to life. _Shem_ is the Hebrew word for "name". In Wishem, the designer's words are what bring the game to life.

Tell the story of the shem as "a word that brings things to life". Do not describe the shem as a holy name or a divine name. `brand.md` tells the same story in the brand voice.

Wishem is the name of the product and the name of the agent.
