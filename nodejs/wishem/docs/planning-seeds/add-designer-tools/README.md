# Tools

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project makes the designer's view of the game: the tools to see and change the game model. The tools are built as a game needs them.

## Result

- A view of the screen, an inspector, and tables of the definitions.
- Overlays, click to select, and drag.
- A toolkit that the agent uses to add a tool.

## Depends on

[Core model](../add-core-model/README.md), [Agent access](../add-agent-access/README.md).

## What is agreed

- The designer expects a view of the game as in the Unity editor, the inspection of entities, and a database view of the things that exist. See example 3 in [`interactions.md`](../../examples/interactions.md) and the wireframe in [`examples/`](../../examples/README.md).
- Tools are built as the project needs them. Each game can have tools that only it uses. See [Tools](../../concepts.md#tools).
- A toolkit exists so that the agent can add a tool without an editor that is built from nothing.
- A renderer draws tool overlays and maps a point on the screen to an entity. See the renderer contract.
- [`brand.md`](../../brand.md) gives the colors, the type, and the voice.

## What is proposed

- A table and an inspector for a registered kind are derived from its declaration.
- The tools highlight each known name in text. See [Recognized names in text](../../concepts.md#recognized-names-in-text-proposed).
- The list of assumptions and the Play, Step, and Rewind controls in the wireframe.

## Open questions

1. **Which changes does the designer make by hand, and which by request?** A drag is agreed. Editing a field value in an inspector is proposed.
2. **How are recognized names in text handled when a match is not certain?** A common word such as "gap" or "ring" can also be a name. A name can match more than one thing. The tools must also show the difference between an immediate match and a link that the agent confirmed.

## Open questions in other seeds

- How does the agent's activity move on the screen? See [Brand identity](../define-brand-identity/README.md).
- The logo mark and the illustration style. See [Brand identity](../define-brand-identity/README.md).
- Where does the conversation with the agent happen? See [Agent access](../add-agent-access/README.md).
- How does the designer review the agent's assumptions? See [Behavior prompts](../add-behavior-prompts/README.md).

## Notes

- The editor in the wireframe is where a project arrives. It is not the first thing to deliver.
- The wireframe is an example. Its layout is not a requirement.
