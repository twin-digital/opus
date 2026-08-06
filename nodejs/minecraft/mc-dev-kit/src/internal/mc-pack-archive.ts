import { archivePackage } from './archive.js'

/**
 * The `mc-pack-archive` command. It takes no arguments, works on the package directory it is run
 * in, and never builds; the bin launcher imports this module for its effect.
 */
try {
  console.log(await archivePackage(process.cwd()))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
