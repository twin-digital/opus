# @thrashplay/wishem-host-nodejs

The Node.js package of Wishem. It runs a construct in one Node.js process. The construct holds a hub, the store of a model folder, and a storage subsystem. It can also mount a product: a second store with a storage subsystem of its own. A WebSocket server carries the link of the hub. The package provides the `wishem` command.

## The command

```
wishem start <folder> [--product <folder>] [--port <number>]
```

The command reads the model folder, starts one construct, and prints the address of the link. It runs until it gets an interrupt signal (Ctrl+C). Then it stops the construct and the server and stops with exit code 0.

- The default port is 4747. Use `--port` to select a different port.
- Use `--product` to mount the model of a product folder as the store `product`. See [The product folder](#the-product-folder).
- The server listens only on `127.0.0.1`.
- If you give no folder, the command prints how to use it and stops with a non-zero exit code.

```
wishem: model /path/to/model
wishem: 1 component type, 1 entity
wishem: link at ws://127.0.0.1:4747/link
```

With `--product`, the command prints the absolute path of the product folder after the line of the model folder, and the counts of the product model after the counts of the model:

```
wishem: model /path/to/model
wishem: product /path/to/product
wishem: 1 component type, 1 entity
wishem: product: 2 component types, 1 entity
wishem: link at ws://127.0.0.1:4747/link
```

## The link

The server carries the link of the hub at the path `/link`. A client opens a WebSocket at `ws://127.0.0.1:4747/link` and follows the protocol in [`nodejs/wishem/hub/LINK.md`](../hub/LINK.md). The `openLink` function and the `webSocketChannel` function of `@thrashplay/wishem-hub` are a client for Node.js and for a web browser.

The server checks the `Origin` header of each link request. It accepts a request with no origin, and a request whose origin has the host name `127.0.0.1`, `localhost`, or `[::1]`. It refuses each other origin with status 403.

Each other request gets status 404 and a JSON body with an `error` message.

## The model folder

```
model/
  definitions/
    ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
  state.json
```

- Each `.json` file in `definitions` holds one component type. The `id` in the file is the ID of the component type. The file name has no meaning. Other files in `definitions` are ignored. The construct never writes a definition file.
- `state.json` holds an object with the key `entities`, the list of the entities.

The construct watches the model folder. After a change of a file, it reads the folder again and gives the new model to the store. A client of the link sees the change.

When a client changes an entity through the store, the construct writes `state.json`. The write is atomic: the construct writes a temporary file in the model folder and renames it to `state.json`. The file is a JSON object with the key `entities`. The construct ignores the change of the watch that its own write causes.

## The product folder

The product folder has the same form as the model folder. The construct mounts it as a second store with the ID `product`. The joined state has the parts `store` and `product`. The input types of the product start with `product/`, for example `product/set-field`.

- The product model refers to nothing of the model of the workbench. The store `product` validates the product model alone.
- The product has a storage subsystem of its own, with the input subsystem `product-files` and the output subsystem `product-files-writer`. Each rule of the model folder applies to each folder alone: the watch, the last correct model, the write of `state.json`, and the hold of the write while the definitions of the store differ from the files.
- A hand edit of one folder changes only the store of that folder. A change of one store writes only the `state.json` of its own folder.
- The product folder and the model folder must be different folders. A product folder inside the model folder is permitted.
- Each problem of a file of the product folder names the absolute path of the file. Each other line about the product starts with `wishem: product: `, for example `wishem: product: the last correct model stays`.

## Problems

- At the start, the command prints each problem with the file that has the problem. If the model is not correct, it does not start the server and it stops with exit code 1.
- During a run, if the model is not correct, the command prints each problem and `the last correct model stays`. The store keeps the last correct model. When the files are correct again, the command prints that the model is correct.
- The command prints each warning.
- If a write of `state.json` fails, the command prints the reason and keeps running.
- If the product folder is the model folder, the command prints that the two folders are the same folder and stops with exit code 1.
- If the port is in use, the command prints the reason and stops with exit code 1.

## Use in code

```ts
import { startConstruct } from '@thrashplay/wishem-host-nodejs'

const construct = await startConstruct({ folder: './model', port: 0 })
console.log(construct.linkUrl, construct.hub.read().store)
await construct.close()
```

To mount a product, give the option `product`:

```ts
const construct = await startConstruct({ folder: './model', product: './product', port: 0 })
console.log(construct.hub.read().store, construct.hub.read().product)
```

`startConstruct` rejects with a `ModelError` when a model is not correct at the start. A problem of the product names the absolute path of its file. It rejects with an `Error` when `product` is the same folder as `folder`. `construct.hub` is the hub of the construct. Its model subsystem `store` holds the model. With `product`, its model subsystem `product` holds the product model. The package exports the constants `PRODUCT_ID`, `PRODUCT_FILES_ID`, and `PRODUCT_FILES_WRITER_ID`. `readModelFolder` reads a folder into the data for a model. `withSource` sets the file on each problem.
