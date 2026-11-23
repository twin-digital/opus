# Expectations

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project lets the designer write what must stay true, in natural language, and attach it to the thing it describes. The agent checks its changes against these expectations.

## Result

- Expectations that are stored with rooms and other things.
- Checks of a change against the expectations.
- Automated tests that the agent makes from expectations.

## Depends on

[Core model](../479-add-core-model/README.md), [Agent access](../480-add-agent-access/README.md).

## What is agreed

- An expectation records intent, and the agent checks changes against it. See rule R14.
- The agent can turn an expectation into a deterministic automated test.
- The agent does not search the whole game for effects that no expectation covers. See rule R15.
- The idea is agreed. The mechanism is not designed. See [Expectations](../../concepts.md#expectations).

## What is proposed

- When the agent sees an effect that no expectation covers, it tells the designer and does not block the change.

## Open questions

1. **How precise must an expectation be before it becomes an automated test?**
2. **How does the agent check an expectation that says something is not possible?** "Cannot cross the gap without the grapple" says that no inputs get the player across. One failed jump does not show that. The agent must search over ways to play, or reason from values such as the jump distance.
3. **Where does a check of an expectation start?** The player must be in the correct place with the correct items. This depends on the question about kept bookmarks.
4. **How does the agent know which expectations a change can affect?**
5. **What does a failed expectation do?** It can block the change, give a warning, or ask the designer.
6. **Who writes an expectation?** Only the designer, or also the agent when a prompt implies one, as "too wide to jump" does.
7. **What happens when the designer breaks an expectation on purpose?**

## Open questions in other seeds

- How does a kept bookmark stay valid when the game model changes? See [Core model](../479-add-core-model/README.md).
- How does the agent write and run a check for a behavior? See [Behavior prompts](../481-add-behavior-prompts/README.md).

## Notes

- Rule R15 in [`rules.md`](../../rules.md) gives the alternatives that are closed for this project.
- This project needs the most design work before it can be specified.
- It depends on the answer to the question about kept bookmarks in the seed for the core model.

## Ideas

These ideas came from a short exploration. They are not agreed and not designed.

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
