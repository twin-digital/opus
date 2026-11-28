# @thrashplay/wishem-sample-product

The sample product of Wishem. It is a small authored model with a color and a count, and two behaviors. Each tick of the clock adds 1 to the count and sets the next color. The workbench, the construct manager, and the renderers use it as the one product to mount, run, and draw.

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

The one entity has the color `#1d4ed8` and the count `0` at the start. The color is a string. The count is a number.

The path of the model folder is `nodejs/wishem/sample-product/model`. To start it alone, run this command from the root of the repository:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start "$PWD/nodejs/wishem/sample-product/model"
```

## The count behavior

`countBehavior` is a native behavior with the ID `sample-product/count` and the component type `Counter`. The update subsystem runs it at each tick. It adds 1 to `count` when the value is a number. Other values stay. The behavior never refuses a tick.

## The color behavior

`colorBehavior` is a native behavior with the ID `sample-product/color` and the component type `Color`. The update subsystem runs it at each tick. It sets `color` to the color at the position `ticks` modulo 4 in `COLORS`: `#1d4ed8`, `#b91c1c`, `#15803d`, `#a16207`. Tick 1 gives `#b91c1c`. Tick 4 gives `#1d4ed8`. A color that a person sets stays until the next tick.

`behaviors` is the list `[countBehavior, colorBehavior]`. A product construct gets the code of the product from this export.

The count and the color depend only on the recorded ticks. A replay or a rewind gives the same values.

Put the `time` subsystem before the update subsystem in the list of subsystems.

## The color cases

A view of the sample product draws the field `color` with this rule. A color is text that matches `#rrggbb`: a hash sign and six hexadecimal digits. The view draws it in lower case. For no value, and for each other value, the view draws the fallback color `#ff00ff`. No view is hidden.

The subpath `@thrashplay/wishem-sample-product/color-cases` exports the table `COLOR_CASES` and the constant `FALLBACK_COLOR`. Each case has a unique `name`, an optional `value`, and the `color` that a view draws. The root entry does not export them. The tests of the three `ClearColor` views check the table.

## Example

```ts
import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import { createUpdate } from '@thrashplay/wishem-update'
import { behaviors } from '@thrashplay/wishem-sample-product'

const hub = createHub({ subsystems: [createTime(), createUpdate({ store: createStore({ model }), behaviors })] })
hub.start()
const controls = hub.attach({ id: 'controls', kind: 'input' })
await controls.submit(timeInputs.advance(100))
// The count of the sample entity is now 1. The color is now `#b91c1c`.
```

`model` is the model of the folder `model/`.

## The React views

The folder `views/react/` holds two React views with their sidecars. The root entry does not import them. The build of the package does not include them.

| View         | Component type | Props                                             | Draws                                                                                           |
| ------------ | -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ClearColor` | `Color`        | `color: string \| undefined`, `wishem: ViewTools` | An element with `role="img"`, the name `Color <value>`, and a 320 by 180 pixel box of the color |
| `Count`      | `Counter`      | `count: number \| undefined`, `wishem: ViewTools` | A paragraph with the text `Count <value>`                                                       |

A view with no value draws nothing.

The workbench loads the views with the option `--product-views`. Give it the path of the folder:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --product-views nodejs/wishem/sample-product/views/react
```
