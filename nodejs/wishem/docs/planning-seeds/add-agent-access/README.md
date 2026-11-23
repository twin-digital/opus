# Agent access

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project gives the agent its tools for a simulation. With them the agent reads the game, changes it while it runs, and saves the change.

## Result

- Tools to query entities, components, and definitions.
- Tools to change the live state and the definitions of a simulation.
- Tools for time: pause, step, rewind, rerun with a changed value, and bookmarks.
- A way to write a change from a paused game to the authored state.

## Depends on

[Core model](../add-core-model/README.md).

## What is agreed

- The agent reads and changes the game model directly. It does not operate an editor that was made for a person. See [`vision.md`](../../vision.md).
- The designer can pause after a missed jump and ask for a change. The agent has the live state, the recording, and the jump rule, and it runs the same inputs again with a new value. See examples 4 and 5 in [`interactions.md`](../../examples/interactions.md).
- A change that the agent makes in a paused game is written to the authored state.
- A renderer maps a point on the screen back to an entity. This resolves a request such as "the platform to my right".

## What is proposed

- Rule R16: the agent states the assumptions that it made.
- The output rule and the input rule: the agent can learn what an output subsystem showed or played, and the agent can take the place of an input subsystem.

## Open questions

1. **Where does the conversation with the agent happen?** In a panel inside the tools, in a terminal with a coding agent, or both. Also for: [Tools](../add-designer-tools/README.md).
2. **How is a change in a paused game written back to authored state?** What happens when the live change conflicts with a file?

## Open questions in other seeds

- What happens in the first minute of an empty project? See [Core model](../add-core-model/README.md).

## Notes

- The notes that started the brainstorm described a local MCP server that connects to the running game, with tools such as `get_state`, `query_entities`, `step`, `screenshot`, `set_flag`, `teleport`, and `hot_reload`. This is input, not a decision.
