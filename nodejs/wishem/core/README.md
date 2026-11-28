# @thrashplay/wishem-core

The model, the validation, and the store of Wishem. The package checks that a model is correct, and it provides the store, a model subsystem of a hub.

The package uses no Node.js API. It runs in a web browser and in Node.js.

## The model

A model is data with two parts.

- `definitions`: a list of component types. Each component type has an `id`, a `label`, and a list of `fields`. Each field has an `id`, a `label`, and a `type`. The types are `string`, `number`, `boolean`, `reference`, and `reference-list`. A value of a `reference` field is the ID of an entity of the model. A value of a `reference-list` field is a list of entity IDs of the model. The list holds no ID two times, and its order is part of the value. `[]` is a correct value and is different from an omitted field.
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

Two component types with the same label cause a warning. The model stays correct. The path of the warning is `definitions`, the index of the later of the two component types, and `label`.

## Validation

`validateModel(data)` checks data against the rules of the model. It returns `{ ok: true, model, warnings }` or `{ ok: false, problems }`. Each problem has a `severity`, a `message`, and a `path`.

`ModelError` is the error that `createStore` throws when the first model is not correct. The error has the list `problems`.

## The store

The store is a model subsystem of a hub (`@thrashplay/wishem-hub`). Its part of the joined state is one model. `createStore(options)` makes the store. `createStore` throws a `ModelError` when the first model is not correct.

Options:

- `id`: the ID of the store. The default is `store`. Each input type starts with the ID and a slash.
- `model`: the first model. The default is a model with no definitions and no entities.

The store applies seven inputs.

| Input type               | Payload                                       | Effect                                                                                                                 |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `store/replace-model`    | `{ model }`                                   | Replaces the model.                                                                                                    |
| `store/add-entity`       | `{ entity, index? }`                          | Adds the entity at `index`, or at the end with no `index`. The ID must be new.                                         |
| `store/remove-entity`    | `{ entity }`, the ID of the entity            | Removes the entity.                                                                                                    |
| `store/set-field`        | `{ entity, componentType, field, value }`     | Sets the value. Adds the component when the entity has none.                                                           |
| `store/clear-field`      | `{ entity, componentType, field }`            | Removes the value. Keeps the component. Keeps the same part when the field has no value to remove.                     |
| `store/add-reference`    | `{ entity, componentType, field, reference }` | Adds the ID `reference` at the end of a `reference-list` list. Sets a list of that one ID when the field has no value. |
| `store/remove-reference` | `{ entity, componentType, field, reference }` | Removes the ID `reference` from the list. Keeps the order of the other items. Leaves `[]` after the last item.         |

The key `reference` is the ID of an entity. `add-reference` refuses an ID that no entity has. An input that changes nothing keeps the same part object. This applies to an `add-reference` of an ID that the list holds, and to a `remove-reference` of an ID that the list does not hold. Both inputs refuse a field that does not have the type `reference-list`.

`storeInputs(id)` gives the functions that make these inputs: `replaceModel`, `addEntity(entity, index?)`, `removeEntity`, `setField`, `clearField`, `addReference`, and `removeReference`.

The store applies an input only when the model after the input is correct. Otherwise, the store refuses the input with problems. Each problem has a `message` and a `path`. The part and the record of the hub do not change. An input that changes nothing keeps the same part object. Each part is frozen. An entity that an input does not change is the same object in the new part.

```ts
const hub = createHub({ subsystems: [createStore({ model })] })
const form = hub.attach({ id: 'form', kind: 'input' })
hub.start()

const result = await form.submit(
  storeInputs().setField({
    entity: 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2',
    componentType: 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34',
    field: 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62',
    value: 'Wishem workbench',
  }),
)
// { ok: true, seq: 1 }

const refused = await form.submit(storeInputs().removeEntity('e_00000000-0000-4000-8000-000000000000'))
// { ok: false, reason: 'invalid', problems: [{ message: 'No entity has the ID "e_00000000-0000-4000-8000-000000000000"', path: ['payload', 'entity'] }] }
```

## API

- `validateModel(data)`: checks data against the rules of the model. Returns `{ ok: true, model, warnings }` or `{ ok: false, problems }`.
- `ModelError`: the error with the list `problems`. `createStore` throws it for a first model that is not correct.
- `createStore(options)`: makes the store, a model subsystem for a hub. See "The store".
- `storeInputs(id)`: gives the functions that make the five inputs of a store.
- `isEqual(a, b)`: compares two values by canonical JSON. The store uses it for models and for the values of `set-field`.

## No Node.js API

The core uses no Node.js API, because it runs in a web browser. The command `pnpm build --filter @thrashplay/wishem-core` compiles the source files without the Node.js types. It fails when a source file uses a Node.js module or global. Test files can use Node.js APIs.
