// Imported as namespaces, not named bindings: the sim's bundler stubs Node builtins out of the browser graph, and a
// named import off that stub fails the build. The browser never evaluates this module — it serves the same directory
// over HTTP instead — but the bundler still has to resolve it.
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Name of the environment variable that overrides the sample directory.
 */
export const SampleDirectoryVariable = 'MUSIC_SAMPLES_DIR'

/**
 * Directory holding the downloaded sound-board samples, populated by `music-fetch-samples`. It lives outside any
 * checkout so the published package behaves the same as the monorepo: the studio installs with
 * `npx @thrashplay/music` and has no repo to read from.
 *
 * Node only. The sim's Vite config serves this directory at `/samples`, and repeats the default below because config
 * fragments load before any of this package's source is compiled.
 */
export const getSampleDirectory = () =>
  process.env[SampleDirectoryVariable] ?? path.join(os.homedir(), '.thrashplay', 'samples')
