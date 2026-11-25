// Starts the workbench for the browser tests, on a copy of the model folder in `.e2e-model/`.
// Usage: node e2e-server.ts
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { modelFolder } from '@thrashplay/wishem-workbench'

/** The port of the page. `playwright.config.ts` uses the same number. */
const PAGE_PORT = 4180
const copy = resolve(import.meta.dirname, '..', '.e2e-model')

// Overwrites files. Deletes nothing.
await cp(modelFolder, copy, { recursive: true })

// Node.js needs the `.ts` extension. TypeScript reads the types through `.js`.
const startModule = './start.ts'
const { startWorkbench } = (await import(startModule)) as typeof import('./start.js')

const workbench = await startWorkbench({ model: copy, port: PAGE_PORT, corePort: 0 })

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
