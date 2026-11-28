# @thrashplay/wishem-sample-product

The sample product of Wishem. It is a small authored model with a color and a count, and a rule that makes each tick of the clock add 1 to the count. The workbench, the construct manager, and the renderers use it as the one product to mount, run, and draw.

The package is private. The root entry uses no Node.js API.

## The model

The folder `model/` is a model folder. It holds two files in `definitions/` and `state.json`.

| Name       | ID                                         | Constant        |
| ---------- | ------------------------------------------ | --------------- |
| `Color`    | `ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512`  | `COLOR_TYPE`    |
| `color`    | `fld_694d6cb2-97e8-444e-961e-aa76744837fb` | `COLOR_FIELD`   |
| `Counter`  | `ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d`  | `COUNTER_TYPE`  |
| `count`    | `fld_ef085a2e-22ef-4409-bac4-9cd5648d0705` | `COUNT_FIELD`   |
| The entity | `e_99969ed3-f499-4dbb-bf6d-958db4542884`   | `SAMPLE_ENTITY` |

The one entity has the color `#1d4ed8` and the count `0`. The color is a string. The count is a number.

The path of the model folder is `nodejs/wishem/sample-product/model`. To start it alone, run this command from the root of the repository:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start "$PWD/nodejs/wishem/sample-product/model"
```

## The count rule

`withCountRule(store)` wraps a store and returns a model subsystem with the ID of the store. It applies each input of the store as the store does. It also applies `time/advance`: for each tick, it adds 1 to each `count` of a `Counter` component whose value is a number. Other values stay. The rule never refuses a tick.

The count depends only on the recorded ticks. A replay or a rewind gives the same count.

Put the `time` subsystem before the wrapped store in the list of subsystems.

## Example

```ts
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import { withCountRule } from '@thrashplay/wishem-sample-product'

const hub = createHub({ subsystems: [createTime(), withCountRule(createStore({ model }))] })
hub.start()
const controls = hub.attach({ id: 'controls', kind: 'input' })
await controls.submit(timeInputs.advance(100))
// The count of the sample entity is now 1.
```

`model` is the model of the folder `model/`.
