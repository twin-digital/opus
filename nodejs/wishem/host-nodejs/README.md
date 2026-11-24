# @thrashplay/wishem-host-nodejs

The Node.js host of Wishem. It reads a model folder, gives the model to a core, and serves the snapshot of the core over local HTTP. It watches the files and gives each change to the core.

## The command

```
wishem start <folder> [--port <number>]
```

The command reads the model folder, starts one core, and prints the address of the snapshot. It runs until it gets an interrupt signal (Ctrl+C). Then it stops the server and stops with exit code 0.

- The default port is 4747. Use `--port` to select a different port.
- The server listens only on `127.0.0.1`.
- If you give no folder, the command prints how to use it and stops with a non-zero exit code.

```
wishem: model /path/to/model
wishem: 1 component type, 1 entity
wishem: snapshot at http://127.0.0.1:4747/snapshot
```

## The HTTP paths

`GET /snapshot` returns the current snapshot as JSON.

```
curl http://127.0.0.1:4747/snapshot
```

`GET /snapshots` returns a stream of Server-Sent Events. The first event has the current snapshot. Each change to the model sends one more event. Each event has the name `snapshot` and the snapshot as JSON on one `data` line.

```
curl -N http://127.0.0.1:4747/snapshots
```

A path that is not known gets status 404. A method that is not `GET` gets status 405. Each of these responses has a JSON body with an `error` message.

## The model folder

```
model/
  definitions/
    ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
  state.json
```

- Each `.json` file in `definitions` holds one component type. The `id` in the file is the ID of the component type. The file name has no meaning. Other files in `definitions` are ignored.
- `state.json` holds an object with the key `entities`, the list of the entities.

## Problems

- At the start, the command prints each problem with the file that has the problem. If the model is not correct, it does not start the server and it stops with exit code 1.
- During a run, the command watches the model folder. After a change, it reads the folder again. If the model is not correct, the command prints each problem and keeps the last correct snapshot. When the files are correct again, the command prints that the model is correct.
- The command prints each warning.
- If the port is in use, the command prints the reason and stops with exit code 1.

## Use in code

```ts
import { startHost } from '@thrashplay/wishem-host-nodejs'

const host = await startHost({ folder: './model', port: 0 })
console.log(host.url, host.core.getSnapshot())
await host.close()
```

`startHost` rejects with a `ModelError` when the model is not correct at the start. `readModelFolder` reads a folder into the data for a core. `withSource` sets the file on each problem from the core.
