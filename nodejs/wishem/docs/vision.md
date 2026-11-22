# Vision

## What Wishem is

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe.

The designer gives direction in the words of a designer:

> "I need a room between the Weighbridge and the Kiln that teaches the grapple before the player needs it under pressure. Quarry biome. One cut too wide to jump, with an iron ring bolted to the far wall in plain view: generate the ring so it reads as something you can hook. No enemies until the player has crossed. After that, two goats, so the second crossing happens with something chasing."

The agent does the work. It creates the room, sizes the cut, generates the ring, and sets the goats to appear after the first crossing. The designer sees the result in the running game.

The goal in one phrase: to "speak a game into existence" through an agent that is integrated directly into the game itself.

## What makes it different

- **The agent works inside the game, not on top of an editor.** It reads and changes the game's own model directly. It does not operate a tool that was made for human hands.
- **Your words are the source.** Behaviors, assets, and requirements are stored as what you asked for. The code and the content are derived from them.
- **The agent can replay what happened.** Pause after a missed jump and say "make the jump high enough so I would have made this". The agent runs your exact inputs again with a new value.
- **Nothing exists until a design needs it.** The model and the tools start nearly empty and grow with the game. Each game gets its own.

## What Wishem does

- **Develops the game model as it is needed.** The agent adds a concept, such as a status or an item, when a design first needs it.
- **Writes behaviors from natural language.** The designer describes what a thing does. The agent writes the code behind the description and keeps the two in agreement.
- **Generates the assets that the model defines.** These are sprites, room layouts, maps, and every other kind of content that the game has. Each asset is stored with the prompt that made it.
- **Creates the tools to see and change the model.** Inspectors, tables, and overlays appear when the game has something for them to show.
- **Adjusts, observes, and queries the model and the game state from inside the running game.** The agent can also rewind play and run it again with a changed value.
- **Automates tests and checks design constraints that are written in natural language.** The agent checks each change against the constraints that the designer wrote.

## What Wishem is not

- It is not a general game engine that is built in full before a game uses it.
- It is not a layer on top of Unity, Godot, or another engine. Wishem owns the game model.
- It is not a tool that drives an existing editor through that editor's user interface.
- It is not a runtime feature for players. Agent-driven characters or hints inside a shipped game are outside the current scope.

## Stage

Wishem is a personal project. The plan is to use it to build a real game first. If it proves useful, it can become a product later.

The first game is a top-down adventure in a 3/4 perspective and a 16-bit console style. See `roadmap.md`.

## Technology

Wishem is written in TypeScript. The agent, not the designer, writes most of the game code, so the language is mainly the agent's concern.

## The name

"Wishem" reads as "wish 'em": the designer wishes game elements into existence. This is the main meaning.

There's a second meaning hidden inside. In golem folklore, a _shem_ (Hebrew for "name") is a word placed in a creation that brings it to life. In Wishem, your words do the same: what you say becomes the game.

Tell the story of the shem as "a word that brings things to life". Do not describe the shem as a holy name or a divine name. `brand.md` tells the same story in the brand voice.

Wishem is the name of the product and the name of the agent.
