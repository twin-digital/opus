// Starts the workbench for the browser tests, on a copy of the model folder in `.e2e-model/`.
// Usage: node e2e-server.ts [--product]
// With `--product`, the workbench mounts a copy of the sample product from `.e2e-product/`, and its model is in
// `.e2e-product-model/`.
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { modelFolder } from '@thrashplay/wishem-workbench'

const { values } = parseArgs({ options: { product: { type: 'boolean' } } })
const withProduct = values.product === true

/** The port of the page. `playwright.config.ts` uses the same numbers. */
const PAGE_PORT = withProduct ? 4190 : 4180
const root = resolve(import.meta.dirname, '..')
const copy = resolve(root, withProduct ? '.e2e-product-model' : '.e2e-model')
const productCopy = resolve(root, '.e2e-product')

// Overwrites files. Deletes nothing.
await cp(modelFolder, copy, { recursive: true })
if (withProduct) {
  await cp(resolve(root, '..', 'sample-product', 'model'), productCopy, { recursive: true })
}

// Node.js needs the `.ts` extension. TypeScript reads the types through `.js`.
const startModule = './start.ts'
const { startWorkbench } = (await import(startModule)) as typeof import('./start.js')

// The generator stays off so that the tests change no file of the repository.
const workbench = await startWorkbench({
  model: copy,
  product: withProduct ? productCopy : undefined,
  port: PAGE_PORT,
  hubPort: 0,
  viewTypes: false,
})

const stop = () => {
  workbench.close().then(
    () => process.exit(0),
    () => process.exit(1),
  )
}
// Removes the exit handler of Vite, so that one handler stops both parts.
process.removeAllListeners('SIGTERM')
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
