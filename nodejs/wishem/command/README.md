# @thrashplay/wishem-command

The `wishem` command of Wishem. It starts a construct for a model folder with `startConstruct` of [`@thrashplay/wishem-host-nodejs`](../host-nodejs/README.md). The package is private and exports no code.

## The command

```
wishem start <folder> [--product <folder>] [--port <number>]
```

The command reads the model folder, starts one construct, and prints the address of the link. It runs until it gets an interrupt signal (Ctrl+C). Then it stops the construct and the server and stops with exit code 0.

- The default port is 4747. Use `--port` to select a different port.
- Use `--product` to mount the model of a product folder as the store `product`. See [The product folder](../host-nodejs/README.md#the-product-folder).
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
