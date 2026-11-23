# Behavior prompts

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project lets the designer describe what a thing does in natural language. The agent writes the code, keeps it in agreement with the description, and replaces it while the game runs.

## Result

- Behaviors with a prompt, code, fields, checks, and a history.
- Code that is replaced in a running simulation.
- The two fixes: a code change for a bug, and a prompt change for a design change.
- Native behaviors.

## Depends on

[Core model](../add-core-model/README.md), [Agent access](../add-agent-access/README.md).

## What is agreed

- The prompt is the source of a behavior, and the code is derived. See rule R9 and [decision 0006](../../decisions/0006-prompt-first-behaviors.md).
- The history of a behavior holds each version. The agent wrote a version from a prompt, or a person wrote it by hand. See rule R10.
- The code for a behavior is stored. A prompt change edits the stored code. See rule R11.
- An answer to a question of the agent becomes a field that the designer can change by hand.
- A name in a prompt is a link to a registered thing. The details are open.
- A native behavior is a behavior whose current version a person wrote by hand. It is not locked.
- See [Behavior prompts](../../concepts.md#behavior-prompts) and [Native behaviors](../../concepts.md#native-behaviors).

## What is proposed

- After a hand-written version, a new prompt starts from the hand-written code.
- Each registered thing has an ID and a label. A field is the first case.
- A rule system as data is a concept that the agent adds when a game has enough behaviors of that shape.

## Open questions

1. **How does the designer review the agent's assumptions?** The mockup shows a list. The owner did not confirm it. Also for: [Tools](../add-designer-tools/README.md).
2. **Does a rule system exist as data, on top of behaviors as code?** A system of triggers and effects can be read without running it. The proposal is that the agent adds one when a game has enough behaviors of that shape.
3. **What happens to a hand-written version of a behavior when a new prompt follows it?** The proposal is that the agent starts from the hand-written code. It is not settled if the designer gets a warning, as for a hand edit to a generated room, and if the checks stay.
4. **How is a name in a prompt linked to a registered thing?** It is not settled how the agent identifies the correct thing, how the link is stored, and what happens when the thing gets a new name or is removed.
5. **How does the agent write and run a check for a behavior?** Also for: [Expectations](../add-expectations/README.md).

## Open questions in other seeds

- How is a field identified and named? See [Core model](../add-core-model/README.md).

## Notes

- How the agent writes and runs a check is not designed. The same question applies to expectations.
- The replacement of code in a running simulation depends on rule R4, which is proposed.
