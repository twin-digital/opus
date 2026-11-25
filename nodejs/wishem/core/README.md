# @thrashplay/wishem-core

The core of Wishem. It holds a model, checks that the model is correct, and sends a snapshot of the model to each listener after a change.

The package uses no Node.js API. It runs in a web browser and in Node.js. A host reads the files and gives the data to the core.

## The model

A model is data with two parts.

- `definitions`: a list of component types. Each component type has an `id`, a `label`, and a list of `fields`. Each field has an `id`, a `label`, and a `type`. The only type is `string`.
- `entities`: a list of entities. Each entity has an `id` and a `components` record. The record maps the ID of a component type to a record. That record maps the ID of a field to a value.

Each ID has a prefix for its kind, an underscore, and a UUID in lowercase. The prefix is `ct` for a component type, `fld` for a field, and `e` for an entity.

```json
{
  "definitions": [
    {
      "id": "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34",
      "label": "AppBar",
      "fields": [{ "id": "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62", "label": "title", "type": "string" }]
    }
  ],
  "entities": [
    {
      "id": "e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2",
      "components": {
        "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": { "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Wishem" }
      }
    }
  ]
}
```

Two component types with the same label cause a warning. The model stays correct.

## Example

`createCore` throws a `ModelError` when the model is not correct. The error has the list `problems`.

```ts
import { createCore } from '@thrashplay/wishem-core'

const core = createCore(modelData)

const stop = core.subscribe((snapshot) => {
  console.log(snapshot.entities.length)
})

const result = core.setModel(newModelData)
if (!result.ok) {
  console.error(result.problems)
}

stop()
```

`setModel` keeps the current model when the new model is not correct. It sends no snapshot when the new model is equal to the current model.

## API

- `validateModel(data)`: checks data against the rules of the model. Returns `{ ok: true, model, warnings }` or `{ ok: false, problems }`.
- `createCore(data)`: makes a core.
- `core.getSnapshot()`: returns the current snapshot.
- `core.subscribe(listener)`: registers a listener. Returns a function that removes it.
- `core.setModel(data)`: gives a new model to the core. For the host that owns the storage.
- `CoreReader`: the interface with `getSnapshot` and `subscribe` only. A `Core` extends it. Code that only reads a model, such as a renderer, accepts a `CoreReader`.

## No Node.js API

The core uses no Node.js API, because it runs in a web browser. The command `pnpm build --filter @thrashplay/wishem-core` compiles the source files without the Node.js types. It fails when a source file uses a Node.js module or global. Test files can use Node.js APIs.
