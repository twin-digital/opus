/**
 * The setup module the plugin contributes. Vitest evaluates it before the test file's own module
 * evaluation, so a pack imported statically at the top of a test file lands its module-scope
 * subscriptions and scheduled runs on the server installed here — with no install call and no
 * ordering the consumer writes.
 *
 * Freshness is per file, which is the runner's own module-registry boundary. State carries between
 * the tests within a file; a test that needs a fresh evaluation reaches for `loadPack`.
 *
 * A consumer never names this file. The plugin references it by resolved path.
 */

import { createServer } from '../create-server.js'
import { __useServer } from '../shim/bindings.js'

// A worker whose module generation outlived the previous file would still hold that file's server;
// the unset is what makes this install unconditional.
__useServer()
__useServer(createServer())
