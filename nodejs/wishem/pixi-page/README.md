# @thrashplay/wishem-pixi-page

The PixiJS page of Wishem. A construct runs in a Node.js process. A page in a web browser draws from the hub of the construct through the link. The package is private.

## The construct

The construct is a hub with two model subsystems and one input subsystem.

- `time`: the part `time` holds `now`, `ticks`, and `running`.
- `store`: the store with the color rule. It holds one entity with a `Clear color` component.
- `clock`: an input subsystem. It sends one `time/advance` for each 500 milliseconds of real time while `running` is `true`.

The hub is always in a Node.js process. This is the decision of the owner for the MVP. A renderer reaches the hub only through the link. `startPixiConstruct` serves the link at `ws://127.0.0.1:4748/link`. Use port 0 in a test to let the system select a port.

### The model

The model is in code. The construct has no storage subsystem. Each start begins at tick 0 with the first color.

```ts
import { CLEAR_COLOR_TYPE, COLOR_FIELD, COLORS, CONSTRUCT_MODEL, SCREEN_ENTITY } from './src/construct/model.js'

// One component type "Clear color" with one field "Color".
// One entity whose "Color" field is COLORS[0].
console.log(CONSTRUCT_MODEL.entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]) // '#1d4ed8'
```

`COLORS` holds four different colors: `#1d4ed8`, `#b91c1c`, `#15803d`, and `#a16207`.

### The color rule

`withColorRule` wraps the store. The result is a model subsystem with the ID `store`. It applies each input of the store. It also applies `time/advance`. For each tick, it sets the `Color` field to `COLORS[ticks % 4]`. It reads `ticks` from the part `time`, which is earlier in the order of the subsystems. If the joined state has no part `time`, it refuses the tick.

The rule is a model subsystem because the record holds only the inputs. A replay or a rewind gives the same colors. A view only gets the fields of its component, and the clock changes only the part `time`.

### The clock

`startPixiConstruct` does these steps in this order:

1. It makes the hub with `createPixiHub`.
2. It calls `serveHub` of `@thrashplay/wishem-host-nodejs`.
3. It starts the hub.
4. It attaches the input subsystem `clock` and calls `startClock` with a step of 500 milliseconds (`STEP_MS`).

With the option `paused`, the part `time` starts with `running` set to `false`. A client of the link can send `time/set-running` to change the value.

```ts
import { startPixiConstruct } from './src/construct/process.js'

const construct = await startPixiConstruct({ port: 4748 })
console.log(construct.linkUrl) // ws://127.0.0.1:4748/link
await construct.close() // stops the clock, the hub, and the server
```

If the port is in use, `startPixiConstruct` rejects with the error (`EADDRINUSE`). No hub and no clock run. `close()` gives the same promise on each call.
