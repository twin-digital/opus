# @thrashplay/wishem-renderer-react

The React renderer of Wishem. It draws React views from the joined state of a port of the hub. It also writes the TypeScript types of the props of the views.

The root entry uses no Node.js API, so it runs in a web browser. The generator is the separate entry `@thrashplay/wishem-renderer-react/view-types`. It runs in Node.js.

The package is private. React is a peer dependency. The package uses `@thrashplay/wishem-core` and `@thrashplay/wishem-hub` for types only.

## What the package does

- `Renderer` gets a port and a table of views. It reads the part `store` of the joined state, and it draws one picture for each component that has a view.
- `Renderer` calls only `read` and `subscribe` of the port. It sends no input. It attaches no subsystem. It does not close the port.
- `Renderer` draws again only when the part `store` is a different object.
- `Renderer` wraps each picture in an element with the attributes `data-wishem-entity` and `data-wishem-component-type`. A view does not add them.
- `collectViews` builds the table of views from the sidecars and the view modules that the page loads.

## What the page does

The renderer knows no address, no link, no folder, and no workbench. The page, or the application, does these tasks:

- It makes the port. It opens a link, or it makes a hub in the page and attaches an output subsystem.
- It closes the port and the link, and it connects again after a link ends.
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

A view gets one prop for each field of the component type. `fieldName` makes the name of the prop from the label of the field. `propNames` gives the props of a definition. A label that gives an empty name, a name that starts with a digit, or the same name as another field is a problem. `viewWarnings` reports only the same name of two fields. The generator reports each of the three problems as an error.

## The generator

`generateViewTypes` writes `<name>.view.gen.ts` next to each sidecar of the kind `react`. The file exports the type `Props`.

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
const views = collectViews(
  import.meta.glob('./views/*.view.json', { eager: true }),
  import.meta.glob(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }),
)

createRoot(document.getElementById('root')!).render(<Renderer port={port} views={views} />)
```

The same `Renderer` takes the remote port of a link: `const link = await openLink(channel, [{ id: 'screen', kind: 'output' }])`, then `port={link.ports.screen}`.

`src/readme-example.test.tsx` runs this code with view modules that the test gives.
