import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
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
  // The leading slash is stripped before joining: an absolute second argument would make `resolve`
  // discard the sample directory entirely and serve from the filesystem root.
  const requested = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, '')
  const file = resolve(sampleDirectory, requested)

  // Reject anything resolving outside the sample directory: the request path arrives unsanitized,
  // so '..' segments would otherwise read arbitrary files off the machine.
  if (!file.startsWith(sampleDirectoryPrefix)) {
    response.statusCode = 403
    response.end()
    return
  }

  stat(file).then(
    (stats) => {
      if (!stats.isFile()) {
        response.statusCode = 404
        response.end()
        return
      }

      response.setHeader('Content-Type', 'audio/ogg')
      response.setHeader('Content-Length', stats.size)
      createReadStream(file).pipe(response)
    },
    () => {
      response.statusCode = 404
      response.end()
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
