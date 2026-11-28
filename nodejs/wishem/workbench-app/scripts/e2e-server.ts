// Starts the workbench for the browser tests, on a copy of the model folder in `.e2e-model/`.
// Usage: node e2e-server.ts [--product | --run]
// With `--product`, the workbench mounts a copy of the sample product from `.e2e-product/`, and its model is in
// `.e2e-product-model/`.
// With `--run`, the workbench mounts a copy of the sample product from `.e2e-run-product/`, with the product code and
// the view files of the sample product (no test file) copied to `.e2e-run-views/`, which ESLint ignores, and its model is in `.e2e-run-model/`.
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { modelFolder } from '@thrashplay/wishem-workbench'

const { values } = parseArgs({ options: { product: { type: 'boolean' }, run: { type: 'boolean' } } })
const withRun = values.run === true
const withProduct = values.product === true || withRun

/** The port of the page. `playwright.config.ts` uses the same numbers. */
const PAGE_PORT =
  withRun ? 4186
  : withProduct ? 4184
  : 4180
const root = resolve(import.meta.dirname, '..')
const copy = resolve(
  root,
  withRun ? '.e2e-run-model'
  : withProduct ? '.e2e-product-model'
  : '.e2e-model',
)
const productCopy = resolve(root, withRun ? '.e2e-run-product' : '.e2e-product')
const viewsCopy = resolve(root, '.e2e-run-views')

// Overwrites files. Deletes nothing.
await cp(modelFolder, copy, { recursive: true })
if (withProduct) {
  await cp(resolve(root, '..', 'sample-product', 'model'), productCopy, { recursive: true })
}
if (withRun) {
  // The views need the `node_modules` of the package, so the copy stays here. It holds no test file.
  await cp(resolve(root, '..', 'sample-product', 'views', 'react'), viewsCopy, {
    recursive: true,
    filter: (source) => !/\.test\.tsx?$/.test(source),
  })
}

// Node.js needs the `.ts` extension. TypeScript reads the types through `.js`.
const startModule = './start.ts'
const { startWorkbench } = (await import(startModule)) as typeof import('./start.js')

// The generator stays off so that the tests change no file of the repository.
const workbench = await startWorkbench({
  model: copy,
  product: withProduct ? productCopy : undefined,
  productCode: withRun ? '@thrashplay/wishem-sample-product' : undefined,
  productViews: withRun ? viewsCopy : undefined,
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
