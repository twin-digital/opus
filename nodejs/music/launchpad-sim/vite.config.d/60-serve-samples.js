import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { defineConfig } from 'vite'

// Serves the sound-board samples at /samples, out of the same directory the Node app reads
// (populated by `music-fetch-samples`). The samples are deliberately not part of any checkout,
// so they cannot be served from the usual public/ directory.
const configuredDirectory = resolve(process.env.MUSIC_SAMPLES_DIR ?? join(homedir(), '.thrashplay', 'samples'))

/**
 * Canonical form of the sample directory, cached once `realpath` first succeeds. Canonical, because
 * containment is tested against the *realpath* of the requested file, and the two sides only share a
 * prefix if both have their symlinks resolved — a sample directory reached through a link
 * (MUSIC_SAMPLES_DIR=/tmp/samples on macOS, where /tmp links to /private/tmp, or an automounted
 * home) would otherwise reject every legitimate sample with a 403.
 *
 * Resolved lazily per request rather than once at startup, because the sim routinely starts before
 * `music-fetch-samples` has created the directory: a prefix frozen at startup would fall back to the
 * lexical path and then mismatch every canonical file path once the directory appeared behind a
 * link, 403ing all samples until the dev server restarted.
 *
 * @type {string | undefined}
 */
let canonicalDirectory

const getSampleDirectory = async () => {
  canonicalDirectory ??= await realpath(configuredDirectory).catch(() => undefined)
  return canonicalDirectory ?? configuredDirectory
}

/**
 * Serves one sample file. A miss answers 404 rather than deferring to the next middleware: /samples
 * is a file namespace, and falling through would hand back the app's index.html with a 200, which
 * the browser would then try to decode as audio.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
const serveSample = async (request, response) => {
  /** @param {number} status */
  const fail = (status) => {
    response.statusCode = status
    response.end()
  }

  let requested
  try {
    // decodeURIComponent throws on malformed escapes ('/samples/%zz'); this handler owns the namespace, so garbage
    // gets a 400 here rather than a throw out of the middleware.
    requested = decodeURIComponent((request.url ?? '').split('?')[0])
  } catch {
    fail(400)
    return
  }

  const directory = await getSampleDirectory()

  // The directory plus a trailing separator, so that a sibling sharing the directory's prefix — '<dir>2/secrets' — is
  // not mistaken for something inside it. The leading slash of the request is stripped before joining: an absolute
  // second argument would make `resolve` discard the sample directory entirely and serve from the filesystem root.
  const prefix = directory + sep
  const file = resolve(directory, requested.replace(/^\/+/, ''))

  // Reject anything resolving outside the sample directory: the request path arrives unsanitized, so '..' segments
  // would otherwise read arbitrary files off the machine.
  if (!file.startsWith(prefix)) {
    fail(403)
    return
  }

  // `resolve` is purely lexical, so the check above only proves the *path* stays inside the sample directory — a
  // symlink planted there would still be followed by stat and the read. `realpath` resolves the link before the
  // containment test is repeated on what the file actually is.
  let real
  try {
    real = await realpath(file)
  } catch {
    fail(404)
    return
  }

  if (!real.startsWith(prefix)) {
    fail(403)
    return
  }

  let stats
  try {
    stats = await stat(real)
  } catch {
    fail(404)
    return
  }

  if (!stats.isFile()) {
    fail(404)
    return
  }

  response.setHeader('Content-Type', 'audio/ogg')
  response.setHeader('Content-Length', stats.size)

  // `pipe` does not forward source errors, and an unhandled 'error' on a stream is thrown as an uncaught
  // exception — which would take the whole dev server down over one unreadable sample. The file can still
  // vanish or turn out to be unreadable between the stat and the open.
  const stream = createReadStream(real)
  stream.on('error', () => {
    if (response.headersSent) {
      // Mid-transfer: the body is already partly written, so the only honest signal left is a broken connection.
      response.destroy()
      return
    }

    // The headers describing the file have to go before the 500 can: they are still pending, and a response that
    // promises Content-Length bytes and then sends none leaves the client waiting for a body that will never arrive.
    response.removeHeader('Content-Type')
    response.removeHeader('Content-Length')
    response.statusCode = 500
    response.end()
  })
  response.on('close', () => {
    stream.destroy()
  })
  stream.pipe(response)
}

/**
 * Connect middleware wrapper: a rejection escaping an async handler would be an unhandled rejection,
 * so whatever `serveSample` cannot answer itself is converted into a plain 500 here.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
const handleSampleRequest = (request, response) => {
  serveSample(request, response).catch(() => {
    if (!response.headersSent) {
      response.statusCode = 500
    }
    response.end()
  })
}

/** @returns {import('vite').Plugin} */
const serveSamples = () => ({
  name: 'serve-samples',

  /** @param {import('vite').ViteDevServer} server */
  configureServer: (server) => {
    server.middlewares.use('/samples', handleSampleRequest)
  },

  /** @param {import('vite').PreviewServer} server */
  configurePreviewServer: (server) => {
    server.middlewares.use('/samples', handleSampleRequest)
  },
})

export default defineConfig({
  plugins: [serveSamples()],
})
