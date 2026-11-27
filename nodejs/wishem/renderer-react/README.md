# @thrashplay/wishem-renderer-react

The React renderer of Wishem. It draws React views from the joined state of a port of the hub. It also writes the TypeScript types of the props of the views.

The root entry uses no Node.js API, so it runs in a web browser. The generator is the separate entry `@thrashplay/wishem-renderer-react/view-types`. It runs in Node.js.

The package is private. React is a peer dependency. The package uses `@thrashplay/wishem-core` for types only. It uses `LinkClosedError` of `@thrashplay/wishem-hub` at run time.

## What the package does

- `Renderer` gets a port, a table of views, and an optional input port `input`. It reads the part `store` of the joined state, and it draws one picture for each component that has a view.
- `Renderer` calls only `read` and `subscribe` of `port`. It calls `submit` of `input` only when a view calls its tools. It sends no input when it draws. It attaches no subsystem. It does not close a port.
- `Renderer` draws again only when the part `store` is a different object.
- `Renderer` wraps each picture in an element with the attributes `data-wishem-entity` and `data-wishem-component-type`. A view does not add them.
- `Renderer` gives each view the prop `wishem` (see "The prop wishem").
- `collectViews` builds the table of views from the sidecars and the view modules that the page loads.

## What the page does

The renderer knows no address, no link, no folder, and no workbench. The page, or the application, does these tasks:

- It makes the port, and the input port. It opens a link, or it makes a hub in the page and attaches an output subsystem and an input subsystem.
- It closes the ports and the link, and it connects again after a link ends.
- It holds the views and the sidecars, and it loads them.
- It holds the fixed content, such as the zero state, and the layout.
- It runs the generator, and it gives the definitions and the command.

## The sidecar

A view has a sidecar, `<name>.view.json`:

```json
{ "kind": "react", "componentType": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34" }
```

This renderer uses the sidecars of the kind `react`. It ignores a sidecar of a different kind. The file `<name>.tsx` next to the sidecar holds the view as its default export.

## The names of props

A view gets one prop for each field of the component type. `fieldName` makes the name of the prop from the label of the field. `propNames` gives the props of a definition.

These cases are a problem: a label that gives an empty name, a name that starts with a digit, a reserved name, or the same name as another field. The names `wishem` and `key` are reserved (`RESERVED_PROP_NAMES`). A field with a reserved name gives no prop. `viewWarnings` reports the same name of two fields and a reserved name. The generator reports each of the four problems as an error.

## The prop wishem

Each view gets the prop `wishem` with two functions:

- `wishem.setField(name, value)` sends one `store/set-field` input for the field whose prop has that name, in the component of the view. The view states no ID. A name that no field has gives the outcome `invalid`, and sends no input.
- `wishem.submit(input)` sends the input as it is.

Each call gives a promise that never rejects. The promise resolves to an `InputOutcome`:

- `{ ok: true, seq }`: the hub accepted the input.
- `{ ok: false, reason, problems }`: the hub refused the input. The `reason` is `not-permitted`, `not-running`, `unknown-type`, or `invalid`. `not-permitted` also means that the renderer has no `input`.
- `reason: 'unknown'`: the link ended before the result. The hub can have accepted the input or not. The renderer does not send the input again.
- `reason: 'failed'`: the hub failed to apply the input.

`wishem` is the same object while the entity, the definition, and the input port do not change. A call goes to the input port of the time when the view got `wishem`. The renderer keeps no state of an input.

```tsx
const AppBarView = ({ title, wishem }: Props) => (
  <button type='button' onClick={() => void wishem.setField('title', 'Wishem studio')}>
    {title}
  </button>
)
```

`stubViewTools` gives a `wishem` for a test of a view, with no hub, no port, and no renderer. It records each call in `calls`.

```tsx
const { tools, calls } = stubViewTools<Values>({ ok: false, reason: 'not-running', problems: [] })
render(<AppBarView title='Wishem' wishem={tools} />)
// ...the person changes the title
expect(calls).toEqual([{ kind: 'setField', name: 'title', value: 'Wishem studio' }])
```

The argument of `stubViewTools` is an outcome, or a function that gives an outcome or a promise for a call. With no argument, the outcome is `{ ok: true, seq: <number of the call> }`.

## The generator

`generateViewTypes` writes `<name>.view.gen.ts` next to each sidecar of the kind `react`. The file exports the type `Values`, with the type that `setField` takes for each field, and the type `Props`, with the type of each prop and the member `wishem: ViewTools<Values>`. A field of the type `string`, `number`, or `boolean` has that type. A `reference` field has the type `string` in this version. A sidecar whose component type has no definition gets `Props` with only `wishem`, and `Values` with no member.

```ts
import { generateViewTypes, viewTypesLines } from '@thrashplay/wishem-renderer-react/view-types'

const result = await generateViewTypes({
  definitions,
  views: '/absolute/path/to/views',
  command: 'pnpm --filter my-product generate',
})
viewTypesLines(result).forEach((line) => console.log(line))
```

The option `command` is the text in the header of each generated file: `// To write this file again: <command>`. The option `check` changes no file and marks each file that is not current. `viewTypesLines` gives one line for each warning, each error, and each file that was written, changed, removed, or is not current.

## Example

```tsx
import { createRoot } from 'react-dom/client'
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { collectViews, Renderer } from '@thrashplay/wishem-renderer-react'

const hub = createHub({ subsystems: [createStore({ model })] })
hub.start()
const port = hub.attach({ id: 'screen', kind: 'output' })
const input = hub.attach({ id: 'screen-input', kind: 'input' })
const views = collectViews(
  import.meta.glob('./views/*.view.json', { eager: true }),
  import.meta.glob(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }),
)

createRoot(document.getElementById('root')!).render(<Renderer port={port} input={input} views={views} />)
```

The same `Renderer` takes the remote ports of a link: `const link = await openLink(channel, [{ id: 'screen', kind: 'output' }, { id: 'screen-input', kind: 'input' }])`, then `port={link.ports.screen}` and `input={link.ports['screen-input']}`.

`src/readme-example.test.tsx` runs this code with view modules that the test gives.
