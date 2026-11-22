# Interactions

> Blueprint, not a specification. See `README.md` for the status labels.

Each example gives what the designer says, what the designer expects, and what Wishem needs for that to work. The designer's requests come from the brainstorm.

The examples start in a project that already has content. The first minute of an empty project is not designed. See `open-questions.md`.

## 1. Golden Grove: a new screen

**Designer:**

> "Let's create a new screen, east of the Water Palace. It's a forest biome, but I want to include a special golden tree. Generate a new sprite for that, and place it in the center of the screen. Scatter standard trees around, and populate the area with Elf Ghosts."

**What Wishem needs:**

- **A world with named places.** "East of the Water Palace" means that screens have names and neighbors. The agent adds the screen and an exit on the shared edge.
- **Biomes as a registered kind.** "Forest" resolves to a tileset, a ground pattern, and a "standard tree".
- **A catalog of things that exist.** The agent finds "Elf Ghost" by name.
- **Placement by intent.** The agent turns "center", "scatter", and "populate" into positions. It then checks that the screen can be walked and that the exits can be reached.
- **Asset generation in the conversation.** The new sprite arrives in the game's style, size, and palette, with a collision footprint. "Golden tree" is a registered name from then on.

**What is stored:** the generation prompt for the layout, the generation prompt for the sprite, and an origin record for each placed thing.

## 2. The flute: a concept that does not exist

**Designer:** "The Elf Ghosts should stay invisible until the player plays the flute near the golden tree."

No flute exists. Nothing can be invisible.

**What the designer expects:**

1. The agent understands that "invisible" is a status, or asks questions until it does.
2. The agent learns the mechanical effects that a status can have from the game model, and registers the new status.
3. The agent creates a "flute" item. It asks what art to use or generate and where the player gets the flute.
4. The agent suggests a distance for "near".
5. The agent builds a behavior for the ghosts. The behavior adds the `invisible` status on spawn and removes it when the flute is played near the tree.

**What Wishem needs:**

- The agent adds new members to registered kinds: a status, an item, a behavior.
- The registry reports what a status can affect, so that the agent can fill in the mechanics.
- The agent knows when it lacks information. It asks about creative gaps (the flute art, where the flute comes from). It proposes values for mechanical gaps (the distance).
- The result is a behavior whose prompt is the designer's sentence.

## 3. After the agent says "done"

**What the designer expects:**

- a rendering of the game, as in the Unity editor, that shows the new screen and where the agent put the entities and assets
- the ability to inspect an entity and see its status
- a database view of all statuses, items, and triggers that exist

See `mockups/editor-after-flute-request.html`. It shows:

- the conversation with the agent
- the screen, with the golden tree, the trees, the ghosts, and a ring for "near"
- an inspector for the selected ghost, its status, and its behavior
- a world map of screens
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

- The agent resolves "my right" against the live game. The presentation contract gives the mapping from the screen to entities.
- The agent moves the platform in the running game.
- The agent writes the new position to the room in the authored state.

## 6. The hookshot gap: a change with a distant effect

The designer raises the jump height to reach one ledge. The same jump now crosses a gap in an earlier screen. That gap was meant to need the hookshot. Nobody is looking at that screen.

**What the designer expects:**

- The agent does not simulate every gap in the game with every power-up. The agent does not know what the designer intends to be possible.
- The designer can add a statement to a room, such as "cannot cross without hookshot".
- The agent checks a change against the statements, in the way that a tester does manual testing.
- The agent can also build deterministic automated tests from the statements.

**Result:**

- If the room has the designer statement "cannot cross without hookshot", the agent checks the jump change against it and reports the conflict.
- If the room has no statement, the agent makes no promise about that room.

## 7. The moved tree: a hand edit to a generated layout

The agent placed ten trees for "scatter standard trees around". One tree blocks a path that the designer likes.

**Option 1: change the prompt.** The designer adds "no trees on the east path" to the generation prompt and selects reapply. The agent removes what the last run placed and places the trees again.

**Option 2: drag the tree.** The designer moves the tree by hand. Nothing else happens. The generation prompt does not change.

If the designer later reapplies the prompt, the moved tree is one of the things the reapply replaces. The system warns first. To keep the edit, the designer changes the prompt to match.

## 8. A behavior the designer does not like

This example was written for the blueprint to show rule R9. It did not come up in the brainstorm.

The ghosts appear the instant the flute plays. The prompt says only "stay invisible until the player plays the flute". The code is correct.

**Designer:** adds to the behavior prompt: "They fade in over one second."

The agent changes the function. The behavior history now shows both prompts. This is a design change, not a bug.

If the ghosts stayed invisible after the flute played, that is a bug. The agent changes the code and the prompt stays the same.
