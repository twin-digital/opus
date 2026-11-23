# Workbench panels

> Planning seed, not a specification. It collects what the blueprint knows about this topic, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This topic is the second slice of the workbench. It adds panels that show the things in a game model, and a way to add and change a panel from the page.

## Result

- One component type, `Panel`, with the fields `title` and `kind`.
- A row of panels. Each panel is a read-only list.
- A zero state when no panel exists.
- A panel appears when it is added to the authored state. A panel disappears when it is removed from the authored state.
- A form to add, change, and remove a panel.

## Depends on

[First workbench UI slice](../477-first-workbench-ui-slice/README.md), [Core and host](../476-add-core-and-host/README.md).

## What is agreed

- A panel is an entity in the authored state of the workbench. Its component type has a title and a kind, and no visual fields.
- A panel is a read-only list of the things of one kind.
- A part of this slice can be outside the game model. The form is such a part.
- These things are not in this slice: live state, steps, time, recorded inputs, rewind, interaction through the game model, and the agent.

## What is proposed

- The `kind` of a panel is the name of a component type. The panel lists each entity that has a component of that type.
- A panel looks for its kind in the subject of the workbench. In this slice the subject of the workbench is the workbench. The page has two addresses, the core of the workbench and the core of its subject, and they are the same address. See [Core and host](../476-add-core-and-host/README.md).
- The first kind is `Panel`. A panel of the kind `Panel` lists itself and each other panel. The slice needs no other data.
- The form gets its list of kinds from the registry. The slice has no way to add a definition while the workbench runs.
- The form sends a request to the core. The core writes the authored state file, and each open window draws again. These requests are the first part of the write group of the attachment interface.
- The root of the HTML renderer puts the panels in a row. A component for layout is added when a design needs a second layout.
- A component type that has no view gets a default view that is derived from its declared fields.
- A view is a registered thing, so that the registry can report which view draws a component type. The slice does not need this.

The HTML renderer gets these parts:

| Part                    | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `useEntitiesWith(kind)` | Gives the entities that have a component of the type `kind` |
| Default view            | Draws a component type that has no view                     |

Example:

```tsx
// Game model
export const Panel = defineComponent('Panel', { title: 'string', kind: 'string' })

// HTML renderer: views/Panel.tsx
export default ({ title, kind }: ViewProps<typeof Panel>) => {
  const rows = useEntitiesWith(kind)
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.label}</li>
        ))}
      </ul>
    </section>
  )
}
```

The names in the table and the example are illustrations. They are not requirements.

## Open questions

1. **How is the authored state laid out in files, and how does the core write it?** The first slice only reads one JSON file. This slice writes. It is not settled what happens when a hand edit and a request change the file at the same time. See question 2 in [Agent access](../480-add-agent-access/README.md).
2. **Does the form stay outside the game model?** The form can later become a tool that is made from the game model of the workbench.

## Notes

- This slice is level 2 of "tools are built as a game needs them", done by the designer and not by the agent. See [Tools](../484-add-designer-tools/README.md).
- The game view of a later game can be one element in a panel of the workbench, with the HTML of the workbench around it.
