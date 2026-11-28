# three-renderers

`@thrashplay/wishem-three-renderers` holds the sample construct of Wishem and its command. It is private.

The sample construct (**Proposed** term) is the product construct of the sample product. It runs in a Node.js process of its own. It has the `time` subsystem, the update subsystem with the count behavior and the color behavior, and a clock with a step of 500 milliseconds. It reads the model folder of `sample-product` and writes no file. The renderers draw it through its link.

## Start the sample construct

```
pnpm --filter @thrashplay/wishem-three-renderers construct [--paused] [--hub-port <number>]
```

| Option             | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `--paused`         | The time of the construct starts paused.                                   |
| `--hub-port <num>` | The port of the link. Default 4750. Use 0 to let the system select a port. |

The command prints the address of the link:

```
wishem: link at ws://127.0.0.1:4750/link
```

With `--paused`, it first prints `wishem: the time of the construct starts paused`.

If the port is in use, the command prints `wishem: port <n> is in use` and ends with exit code 1. A value of `--hub-port` that is not a number from 0 to 65535 also gives exit code 1. `SIGINT` and `SIGTERM` send `stopping` on each open link and end the command with exit code 0.

## Use from code

```ts
import { startSampleConstruct } from '@thrashplay/wishem-three-renderers'

const construct = await startSampleConstruct({ port: 0, paused: true })
console.log(construct.linkUrl)
await construct.close()
```

`startSampleConstruct` rejects with `EADDRINUSE` when the port is in use. `close()` gives the same promise on each call.
