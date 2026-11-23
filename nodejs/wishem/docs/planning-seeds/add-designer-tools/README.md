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

### The workbench

The workbench is the application in which the designer uses the tools. It is a game that is made with Wishem, with its own game model and its own core. See [Core and host](../476-add-core-and-host/README.md).

- Each project has its own workbench. The workbench starts from a base that Wishem supplies, and it grows with the game. Its definitions, its views, and its authored state are stored in the project folder of the game.
- A tool is made in the same way as a thing in a game. The request of the designer is stored with the tool. The tool has kept code and a history, and the workbench can be rewound.
- The agent changes the workbench through the same interface that it uses on the game.

"Tools are built as a game needs them" has four levels:

| Level                                    | What changes                                                                          | Example                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Derived tool                          | Nothing in the workbench                                                              | The game declares `Statuses`. A table and an inspector for it exist immediately. |
| 2. Authored state of the workbench       | The agent adds an entity to the workbench model                                       | A panel that lists the goats                                                     |
| 3. Definitions of the workbench          | The agent declares a component type of the workbench, with its view and its behaviors | A world map. An overlay that shows the range of the whistle.                     |
| 4. View for a component type of the game | A view in the workbench for one component type of the game                            | A special editor for a `Statuses` field                                          |

Levels 2 and 3 are what makes Wishem different. Level 4 is the custom inspector of other editors.

## Open questions

1. **Which changes does the designer make by hand, and which by request?** A drag is agreed. Editing a field value in an inspector is proposed.
2. **How are recognized names in text handled when a match is not certain?** A common word such as "gap" or "ring" can also be a name. A name can match more than one thing. The tools must also show the difference between an immediate match and a link that the agent confirmed.
3. **How does a view of the workbench stay correct when a definition of the game changes?** A level 4 view depends on a component type of the game. The tracking of links can tell the agent which tools to check again. See [Recognized names in text](../../concepts.md#recognized-names-in-text-proposed).
4. **How does the designer recover when a change breaks the workbench?** A bad view can break the screen that the designer uses for the repair. A rewind of the workbench is one answer. A base set of views that always loads is a second answer.

## Open questions in other seeds

- How does the agent's activity move on the screen? See [Brand identity](../define-brand-identity/README.md).
- The logo mark and the illustration style. See [Brand identity](../define-brand-identity/README.md).
- Where does the conversation with the agent happen? See [Agent access](../add-agent-access/README.md).
- How does the designer review the agent's assumptions? See [Behavior prompts](../add-behavior-prompts/README.md).

## Notes

- The editor in the wireframe is where a project arrives. It is not the first thing to deliver.
- The wireframe is an example. Its layout is not a requirement.
