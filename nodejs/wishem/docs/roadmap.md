# Roadmap

> Blueprint, not a specification. See `README.md` for the status labels.

This file is the only part of the blueprint that describes future work. Each project gets its own OpenSpec change, with its own brainstorm, when its turn comes.

## Projects

The list of projects is **Agreed**. The order after project 0 is **Open**.

| #   | Project              | Result                                                                                                                     | Depends on |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | **Blueprint**        | This folder.                                                                                                               | None       |
| 1   | **Core model**       | Entities and components with declared fields. Step, snapshot, restore, rewind, rerun, bookmarks. A first renderer adapter. | 0          |
| 2   | **Agent access**     | The tools an agent uses on a running game: query, edit, pause, step, rerun, and write changes to authored state.           | 1          |
| 3   | **Behavior prompts** | Behaviors with prompt, code, and history. Code is replaced while the game runs.                                            | 1, 2       |
| 4   | **Asset prompts**    | Room layouts and sprites from prompts. Origin records, reapply, and the hand-edit warning.                                 | 1, 2       |
| 5   | **Expectations**     | Expectations stored with rooms and other things. The agent checks changes against them and turns them into tests.          | 1, 2       |
| 6   | **Tools**            | The designer's view: screen view, inspector, tables derived from declarations, overlays, click to select, drag.            | 1, 2       |
| 7   | **Other engines**    | A wire protocol between the game model and a renderer in another engine. **Parked.**                                       | 1          |

Notes:

- Project 4 depends on an outside image model. Pixel art in one consistent style is the least certain part of the plan. An earlier prototype already generated sprites with PixelLab and Retro Diffusion, which lowers that risk.
- Project 5 needs the most design work before it can be specified. See "Ideas for project 5" below. The blueprint records what an expectation is for and not how the agent checks one. Project 5 also depends on the answer to the open question about kept bookmarks.
- Project 7 stays parked until a second engine is wanted. Rule R1 keeps it possible.

## Ideas for project 5: Expectations

These ideas came from a short exploration. They are not agreed and not designed. Use them as the starting point for the brainstorm of project 5.

### What an expectation can be about

- **Possibility.** "Cannot cross the gap without the grapple." "The player can always get back to the Weighbridge." "Every room can be reached."
- **Teaching and sequence.** "The player has used the grapple one time or more before the Kiln."
- **Pacing.** "A new player completes this room in less than two minutes."
- **Difficulty.** "A careless player with three hearts survives two goats."
- **What the player can see.** "The ring is visible from the entrance." "No exit is hidden behind scenery."
- **Look.** "Each sprite uses the sixteen-color palette." "Nothing is taller than three tiles."
- **Tone.** "Nothing appears suddenly next to the player." "No enemy is faster than the hero."
- **Economy.** "The player can pay for the lantern before the mine."
- **Technical limits.** "No room has more than forty active entities."

### Where an expectation can attach

An expectation can attach to one entity, a room, a region, a kind of asset, or the whole game. An expectation on the whole game is a design pillar: a rule that the game never breaks.

### How strong an expectation can be

- **Must.** A failure stops the change.
- **Should.** A failure is reported.
- **Watch.** There is no pass or fail. The agent measures a value after each change and shows how it moves. Example: the time to complete a room.

### How the agent can check an expectation

- **From values.** The agent compares the jump distance with the width of the gap. No play is necessary.
- **With a scripted run** from a bookmark.
- **With a search.** A bot tries many ways to play. An expectation that says something is not possible needs this.
- **With player profiles.** Examples: a careful player, a fast player, a new player. Pacing and difficulty depend on the player.
- **From a screenshot,** for what the player can see and for the look.
- **From the designer's recordings.** "The recording in which I completed this room must still succeed." The designer makes this expectation by play, with no text.
- **By judgment.** "This room feels too small." This is an opinion of the agent and must be shown as an opinion.

### What expectations make possible

- **An end condition for the agent's work.** The agent builds a room, checks it, and builds it again until the expectations pass.
- **Proof by replay.** When an expectation fails, the agent shows a bookmark and a replay of the failure.
- **Conflicts between expectations.** "Too wide to jump" and "can be reached with no items" cannot both be true. The agent reports this before it builds.
- **Suggested expectations.** The agent offers an expectation when a prompt implies one, or when a change breaks something that was not recorded.
- **A coverage view.** The view shows which rooms have no expectations.
- **History and waivers.** These record why an expectation changed, or why the designer broke one on purpose.

### Highest value first

1. An end condition for the agent's work. It changes what the agent can do with no person present.
2. Proof by replay. It uses rewind and bookmarks.
3. The designer's recordings as expectations. They cost the designer nothing to make.
4. Design pillars on the whole game.

## Order

**Proposed:** do not finish one project before the next one starts. Let the first game pull a thin thread through projects 1 to 4 early: one room, one hero, one behavior prompt, one generated sprite, one change made from a paused game. Then widen each project.

Reason: the projects exist to serve one conversation between a designer and the agent. A thin thread proves that conversation before any one part is complete.

The owner did not confirm this order.

## The first game

- A top-down adventure in a 3/4 perspective and a 16-bit console style. (**Agreed**)
- The owner builds it with a young collaborator. (**Agreed**)
- The game is a consumer of Wishem and is its own separate product. Wishem is the product that this blueprint describes. (**Agreed**)
- The game has its own product folder in this repository. It is not inside `nodejs/wishem/`. (**Agreed**)
- The game is built from scratch on Wishem. (**Agreed**)
- The game's world, characters, and art are original. It uses the mechanics of its genre only. (From the notes that started the brainstorm.)

### Relation to the earlier prototype

An earlier prototype of a game of the same kind exists in a separate repository. It is a throwaway.

- Its art assets are likely to move to the first game. (**Agreed**)
- Its code and workflows do not move. (**Agreed**)

Things in the prototype that agree with this blueprint, as evidence and not as a base to build on:

- game logic in `src/core/` with no renderer imports
- rooms as text files on a world grid, and creatures as data
- a wish for art recipes that store the tool, prompt, seed, and chosen variant with each asset

## Planning method

- Each project is planned as an OpenSpec change in this repository. (**Agreed**)
- Formal specifications live in `openspec/specs/wishem/<area>/<capability>/spec.md`. (**Agreed**, from the repository convention)
- The blueprint is the input to each change. When a change settles a **Proposed** or **Open** item, update the blueprint in the same change.
