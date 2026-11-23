# Interactions

> Blueprint, not a specification. See `../README.md` for the status labels. This file is an example. See `README.md` in this folder.

Each example gives what the designer says, what the designer expects, and what Wishem needs for that to work. The examples follow one room, the quarry room, through its life.

The designer's words and the "What the designer expects" lists come from the owner. The "What Wishem needs" lists are the reading of the agent that wrote this file. They are not agreed.

The examples start in a project that already has content. The first minute of an empty project is not designed. See [#479](https://github.com/twin-digital/opus/issues/479).

## 1. The quarry room: a room with a purpose

**Designer:**

> "I need a room between the Weighbridge and the Kiln that teaches the grapple before the player needs it under pressure. Quarry biome. One gap too wide to jump, with an iron ring bolted to the far wall in plain view: generate the ring so it reads as something you can hook. No enemies until the player has crossed. After that, two goats, so the second crossing happens with something chasing."

The designer states a purpose and constraints. The designer does not give a layout.

**What Wishem needs:**

- **A world with named places.** "Between the Weighbridge and the Kiln" means that rooms have names and neighbors. The agent adds the room and an exit to each neighbor.
- **Biomes as a registered kind.** "Quarry" resolves to a tileset, a ground pattern, and standard scenery.
- **A catalog of things that exist.** The agent finds "grapple" and "goat" by name.
- **Layout from intent.** "Too wide to jump" and "something you can hook" are measurements. The agent reads the jump distance and the grapple range from the model. It sizes the gap between the two.
- **Sightlines.** "In plain view" means that the player sees the ring from the entrance. The agent checks this.
- **Pacing.** "No enemies until the player has crossed" means that the goats appear after the first crossing. The agent adds that trigger.
- **Proof by play.** The agent runs the room with no window. It confirms that a jump fails, that the grapple crosses, and that the goats chase on the way back.
- **Asset generation in the conversation.** The ring sprite arrives in the game's style, size, and palette. It is registered as a grapple target, and "iron ring" is a name from then on.

**What is stored:** the asset prompt for the room, the asset prompt for the sprite, and the provenance of each placed thing.

## 2. The shift whistle: a concept that does not exist

**Designer:** "The goats stay docile until the shift whistle blows."

No whistle exists. Nothing in the game can be docile.

**What the designer expects:**

1. The agent understands that "docile" is a status, or asks questions until it does.
2. The agent learns the mechanical effects that a status can have from the model, and registers the new status.
3. The agent creates a "shift whistle". It asks what art to use or generate and what makes the whistle blow.
4. The agent suggests how far the whistle carries.
5. The agent builds a behavior for the goats. The behavior adds the `docile` status on spawn and removes it when the whistle blows in range.

**What Wishem needs:**

- The agent adds new members to registered kinds: a status, a thing in the world, a behavior.
- The registry reports which behaviors read a status, so that the agent can fill in the mechanics.
- The agent knows when it lacks information. It asks about creative gaps (the whistle art, what blows it). It proposes values for mechanical gaps (the range).
- The result is a behavior whose prompt is the designer's sentence.

## 3. After the agent says "done"

**What the designer expects:**

- a rendering of the game, as in the Unity editor, that shows the new room and where the agent put the entities and assets
- the ability to inspect an entity and see its status
- a database view of all statuses, items, and triggers that exist

See `editor-after-whistle-request.html`. It shows:

- the conversation with the agent
- the room, with the gap, the iron ring, the rubble, the goats, and a ring for the range of the whistle
- an inspector for the selected goat, its status, and its behavior
- a world map of rooms
- tables of the registered kinds

In the mockup, green marks what the agent added. Amber marks what the agent assumed. The assumption list and the Play, Step, and Rewind controls are **Proposed**.

## 4. The missed jump: a change from a paused game

**Designer**, after a pause: "Make the player jump height high enough so I would have made this."

**What Wishem needs:**

- the paused live state: the position of the player and of the ledge
- the recording of the last seconds: the inputs and the path that the player took
- the jump rule as something the agent can read and change
- a rerun of the same inputs with a new value, to see if the player lands

The agent changes the value in the running game and writes the change to the authored state.

## 5. The platform: a place relative to the player

**Designer**, after a pause: "Move the platform to my right so I wouldn't have fallen."

**What Wishem needs:**

- The agent resolves "my right" against the live game. The renderer contract gives the mapping from the screen to entities.
- The agent moves the platform in the running game.
- The agent writes the new position to the room in the authored state.

## 6. The gap: a change with a distant effect

In example 4 the designer raises the jump to reach a ledge in another room. The same jump now crosses the gap in the quarry room. That room exists to teach the grapple. Nobody is looking at it.

**What the designer expects:**

- The agent does not simulate every gap in the game with every power-up. The agent does not know what the designer intends to be possible.
- The designer can add an expectation to a room, such as "cannot cross the gap without the grapple".
- The agent checks a change against the expectations, in the way that a tester does manual testing.
- The agent can also build deterministic automated tests from the expectations.

**Result:**

- If the quarry room has the expectation "cannot cross the gap without the grapple", the agent checks the jump change against it and reports the conflict.
- If the room has no expectation, the agent makes no promise about that room.

## 7. The moved rubble: a hand edit to a generated layout

**Designer:** "Break up the floor on the near side with rubble piles."

The agent places six piles. One pile blocks the run-up to the gap.

**Option 1: change the prompt.** The designer adds "keep the run-up to the gap clear" to the asset prompt and selects reapply. The agent removes what the last run placed and places the rubble again.

**Option 2: drag the pile.** The designer moves the pile by hand. Nothing else happens. The asset prompt does not change.

If the designer later reapplies the prompt, the moved pile is one of the things the reapply replaces. The system warns first. To keep the edit, the designer changes the prompt to match.

## 8. A behavior the designer does not like

This example shows rule R9.

The goats charge the instant the whistle blows. The prompt says only "stay docile until the shift whistle blows". The code is correct.

**Designer:** adds to the behavior prompt: "They paw the ground for one second before they charge."

The agent changes the function. The behavior history now shows both prompts. This is a design change, not a bug.

If the goats stayed docile after the whistle blew, that is a bug. The agent changes the code and the prompt stays the same.
