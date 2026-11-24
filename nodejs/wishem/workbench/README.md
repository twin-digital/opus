# @thrashplay/wishem-workbench

The base workbench of Wishem. It holds the first model and a command to start it. The model has one component type, `AppBar`, and one entity with an `AppBar` component.

## Start

The `wishem` command comes from `@thrashplay/wishem-host-nodejs`. Build that package before the first start.

```
pnpm build --filter "@thrashplay/wishem-*"
pnpm --filter @thrashplay/wishem-workbench start
```

The command prints the address of the snapshot. Open it in a second terminal.

```
curl http://127.0.0.1:4747/snapshot
```

To stop the command, press Ctrl+C.

## The model

```
model/
  definitions/
    ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
  state.json
```

- `definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json` declares the component type `AppBar`. The component type has one field, `title`, of type `string`.
- `state.json` holds one entity. The entity has one `AppBar` component. The value of the `title` field is `Wishem`.

## Change the model by hand

1. Start the command.
2. Open `model/state.json`.
3. Change the value `Wishem` to other text. Save the file.
4. Request the snapshot again. The snapshot has the new text. You do not restart the command.

To see each change as it happens, run `curl -N http://127.0.0.1:4747/snapshots`.

If a saved file is not correct, the command prints each problem and the snapshot does not change. When you correct the file, the command prints that the model is correct.

## Use in code

```ts
import { modelFolder } from '@thrashplay/wishem-workbench'

console.log(modelFolder) // the absolute path of model/
```
