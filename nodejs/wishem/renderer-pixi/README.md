# @thrashplay/wishem-renderer-pixi

The PixiJS renderer of Wishem. It reads the joined state of a construct through a port and draws one PixiJS display object for each component that has a PixiJS view.

The package uses no Node.js API. The lint of the package fails when a source file, other than a test file, imports a `node:` module. The tests run in Node.js with no web browser and no graphics card.

## What the package does and what the page does

The package is a library. It does not know the address of a hub, a link, a folder of views, or a clock.

The page that uses the package does this:

- It makes the port. The port is a direct port of a hub in the same process, or a remote port of a link.
- It holds the view files and the sidecars, and it calls `collectViews` to make the table of views.
- It makes the PixiJS application, and it gives `app.stage` and `app.screen` to the renderer.
- It closes the port.

The renderer does this:

- It reads the part `store` through `read` and `subscribe` only.
- It adds one root container to the stage, and it keeps one display object for each drawn component in that root.
- It sets the display objects again when the part `store` is a different object.

The renderer sends no input, attaches no subsystem, and does not close the port. It does not draw. The PixiJS application draws the stage on each frame.

`pixi.js` is a peer dependency. The page and the package must use one copy of PixiJS.

## A PixiJS view and its sidecar

A view file `<name>.ts` has a default export with two functions:

- `create()` makes the display object of one component. The renderer calls it one time for each component.
- `update(display, props, viewport)` sets each property of the object from the props and the viewport only.

The sidecar of the view file is `<name>.view.json`:

```json
{ "kind": "pixi", "componentType": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34" }
```

`collectViews(sidecars, modules)` takes the results of `import.meta.glob` with `eager: true`. It ignores a sidecar of a different kind. It throws a `ViewCollectionError` that names the sidecar files when:

- a sidecar is not a JSON object with a `kind` and a `componentType` that are text;
- a sidecar of the kind `pixi` has no view file;
- the default export of a view file has no `create` function or no `update` function;
- two sidecars of the kind `pixi` name the same component type.

A file with the name `*.test.ts` is never a view file.

## The names of the props

A view gets one prop for each field in the definition of its component type. The name of a prop comes from the label of the field. The words of the label are joined in camel case, and the first letter is a small letter. For example, the label `Max health` gives the prop `maxHealth`.

A prop has no value when the component omits the field. For two fields with one name, the prop has the value of the first field. The renderer writes one warning with `console.warn` for each later field of that name. The line of a warning is:

```text
wishem: the sidecar <sidecar>: the fields <first field ID> and <later field ID> of the component type <component type ID> give the same name "<name>". The prop has the value of the first field.
```

A field whose label gives an empty name (for example `???`) gives no prop. The renderer writes one warning with `console.warn` for each such field. The renderer writes the warnings again only when they change. The line of a warning is:

```text
wishem: the sidecar <sidecar>: the label of the field <field ID> of the component type <component type ID> gives an empty name. The view does not get the field.
```

The renderer sorts the warnings by sidecar, component type, name, and kind.

## Warnings for a view that has no definition

A view whose sidecar names a component type that has no definition draws nothing. The renderer writes one warning with `console.warn` for it. The line of the warning is:

```text
wishem: the sidecar <sidecar> names the component type <component type ID>, which no definition has. No view is drawn for it.
```

The renderer writes no warning when the joined state has no part `store`.

## The entity at a point

`entityAt(x, y)` gives the entity ID and the component type ID of the top visible display object that contains the point. It gives no value when no visible object contains the point, and after the stop.

## Errors of a view

When `create` or `update` throws, the renderer hides the display object (or makes none), gives the error to `onError`, and continues with the other views. The default `onError` writes the error to `console.error`. The next different part `store` calls the view again.

## The stop

`stop()` removes the listener from the port, and removes and destroys the root container and each display object of the renderer. A second call does nothing. After the stop, an event of the port changes nothing. The port stays open. A display object that the renderer did not make does not change, so two renderers can share one stage.

## Example

The code of `src/readme-example.test.ts` runs this example. The test gives the modules that `import.meta.glob` gives in a Vite application.

```ts
import { Container } from 'pixi.js'
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Model } from '@thrashplay/wishem-core'
import { collectViews, startRenderer } from '@thrashplay/wishem-renderer-pixi'

const CLEAR_COLOR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const COLOR_FIELD = 'fld_9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

const model: Model = {
  definitions: [
    { id: CLEAR_COLOR, label: 'Clear color', fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }] },
  ],
  entities: [
    { id: 'e_5b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b', components: { [CLEAR_COLOR]: { [COLOR_FIELD]: '#1d4ed8' } } },
  ],
}

const hub = createHub({ subsystems: [createStore({ model })] })
hub.start()
const port = hub.attach({ id: 'screen', kind: 'output' })
const views = collectViews(
  import.meta.glob('./views/*.view.json', { eager: true }),
  import.meta.glob(['./views/*.ts', '!./views/*.test.ts'], { eager: true }),
)
const stage = new Container()
const renderer = startRenderer({ port, views, stage, viewport: { width: 640, height: 360 } })

renderer.entityAt(10, 10) // { entity: 'e_5b0e...', componentType: 'ct_...' }
renderer.stop()
port.close()
```
