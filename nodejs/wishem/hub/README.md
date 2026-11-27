# @thrashplay/wishem-hub

The hub of a Wishem construct. It joins the model data of the model subsystems, applies the inputs, and keeps the record of the accepted inputs.

The package uses no Node.js API and no browser API. The command `pnpm build --filter @thrashplay/wishem-hub` fails when a source file uses a Node.js module or global.

## Example

```ts
import { createHub, type ModelSubsystem } from '@thrashplay/wishem-hub'

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
}

const hub = createHub({ subsystems: [counter] })
const buttons = hub.attach({ id: 'buttons', kind: 'input' })
hub.start()
await buttons.submit({ type: 'counter/add', payload: { by: 2 } }) // { ok: true, seq: 1 }
```
