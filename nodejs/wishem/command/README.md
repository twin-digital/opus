# @thrashplay/wishem-command

The `wishem` command of Wishem. It starts a construct for a model folder with `startConstruct` of [`@thrashplay/wishem-host-nodejs`](../host-nodejs/README.md). The package is private and exports no code.

## The command

```
wishem start <folder> [--product <folder>] [--product-code <module>] [--port <number>]
```

The command reads the model folder, starts one construct, and prints the address of the link. It runs until it gets an interrupt signal (Ctrl+C). Then it stops the construct and the server and stops with exit code 0.

- The default port is 4747. Use `--port` to select a different port.
- Use `--product` to mount the model of a product folder as the store `product`. See [The product folder](../host-nodejs/README.md#the-product-folder).
- Use `--product-code` to name the product code. It needs `--product`. See [The product code](#the-product-code).
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

## Product constructs

With `--product`, the construct of the command holds the construct list as the part `constructs`. The command attaches the construct manager of [`@thrashplay/wishem-construct-manager`](../construct-manager/README.md) to its hub with `childProcessLauncher()`. Each product construct runs in a product construct process, a child process of the command. With no `--product`, the command has no part `constructs` and no construct manager.

A client of the link of the command sends these inputs: `constructs/start`, `constructs/stop`, `constructs/send`, and `constructs/rewind`. With `--product-code`, each product construct runs the behaviors of the product code. With no `--product-code`, a product construct has no behaviors.

The command prints each line of the construct manager:

```
wishem: construct play runs in the process 48213
wishem: construct play runs, link at ws://127.0.0.1:41377/link
wishem: construct play stopped
```

The command passes no link. The entry of the construct in the part `constructs` and the terminal line give the address of the product construct. A client connects to this address directly.

The command stops each product construct before it stops the construct. This happens after an interrupt signal (Ctrl+C), after `SIGTERM`, and after an error of the file watcher. If a stop signal comes before the start ends, the command attaches no construct manager. If `SIGKILL` ends the command, each product construct process ends by itself, because its channel to the command closes.

## The product code

`--product-code <module>` names the module with the export `behaviors`. Each product construct process loads the module at its start. The command process does not load it. The value follows two rules:

- A value that starts with `.` or `/` is a path. The command resolves it from the folder of the command process, as it does for `<folder>` and `--product`.
- Each other value is a package name. The command resolves it from its own package, with `import.meta.resolve`.

The command prints `wishem: product code <value>` after the line of the product folder. Before the start, it checks the module in a child process. The check fails when the child gives no answer in 5 seconds. A new version of the module runs after a stop and a start of the product construct.

```
wishem start ./model --product ./product --product-code @thrashplay/wishem-sample-product
```

If the code cannot be used, the command prints the reason, starts no server, and stops:

| Case                                    | Line                                                                                     | Exit code |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| `--product-code` with no `--product`    | `wishem: --product-code needs --product` and the usage line                              | 2         |
| An empty value                          | The usage line                                                                           | 2         |
| A module that cannot be loaded          | `wishem: the product code <value> cannot be loaded: <reason>`                            | 1         |
| `behaviors` is not a correct list       | `wishem: the product code has no correct list behaviors: <reason>`                       | 1         |
| A module that does not end in 5 seconds | `wishem: the product code <value> cannot be loaded: The check did not end in 5 seconds.` | 1         |
