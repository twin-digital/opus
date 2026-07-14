import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { defineConfig } from 'vite'

// Serves the sound-board samples at /samples, out of the same directory the Node app reads
// (populated by `music-fetch-samples`). The samples are deliberately not part of any checkout,
// so they cannot be served from the usual public/ directory.
const sampleDirectory = resolve(process.env.MUSIC_SAMPLES_DIR ?? join(homedir(), '.thrashplay', 'samples'))

// The directory plus a trailing separator. Containment is tested against this rather than against
// the bare directory, so that a sibling sharing its prefix — '<dir>2/secrets' — is not mistaken for
// something inside it.
const sampleDirectoryPrefix = sampleDirectory + sep

/**
 * Serves one sample file. A miss answers 404 rather than deferring to the next middleware: /samples
 * is a file namespace, and falling through would hand back the app's index.html with a 200, which
 * the browser would then try to decode as audio.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
const handleSampleRequest = (request, response) => {
  /** @param {number} status */
  const fail = (status) => {
    response.statusCode = status
    response.end()
  }

  let requested
  try {
    // Throws URIError on any malformed escape ('/samples/%zz'). The app only ever builds well-formed URLs, but this
    // handler owns the /samples namespace and should answer garbage itself rather than throw out of the middleware.
    requested = decodeURIComponent((request.url ?? '').split('?')[0])
  } catch {
    fail(400)
    return
  }

  // The leading slash is stripped before joining: an absolute second argument would make `resolve` discard the sample
  // directory entirely and serve from the filesystem root.
  const file = resolve(sampleDirectory, requested.replace(/^\/+/, ''))

  // Reject anything resolving outside the sample directory: the request path arrives unsanitized, so '..' segments
  // would otherwise read arbitrary files off the machine.
  if (!file.startsWith(sampleDirectoryPrefix)) {
    fail(403)
    return
  }

  // `resolve` is purely lexical, so the check above only proves the *path* stays inside the sample directory — a
  // symlink planted there would still be followed by stat and the read. `realpath` resolves the link before the
  // containment test is repeated on what the file actually is.
  realpath(file).then(
    (real) => {
      if (!real.startsWith(sampleDirectoryPrefix)) {
        fail(403)
        return
      }

      stat(real).then(
        (stats) => {
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
              // Mid-transfer: the body is already partly written, so the only honest signal left is a broken
              // connection.
              response.destroy()
              return
            }

            response.statusCode = 500
            response.end()
          })
          response.on('close', () => {
            stream.destroy()
          })
          stream.pipe(response)
        },
        () => {
          fail(404)
        },
      )
    },
    () => {
      fail(404)
    },
  )
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
