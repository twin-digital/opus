import { isBrowser } from '../app/is-browser.js'

/**
 * Extension of the sample files on disk. Sample names elsewhere omit it.
 */
export const SampleFileExtension = 'ogg'

/**
 * Path the sim serves the sample directory from. See the `serve-samples` fragment in the sim's Vite config.
 */
export const BrowserSampleBaseUrl = '/samples'

const readInBrowser = async (name: string): Promise<ArrayBuffer> => {
  const response = await fetch(`${BrowserSampleBaseUrl}/${name}.${SampleFileExtension}`)
  if (!response.ok) {
    throw new Error(`Sample request failed. [name=${name}, status=${response.status}]`)
  }

  return response.arrayBuffer()
}

const readInNode = async (name: string): Promise<ArrayBuffer> => {
  // Imported dynamically, unlike sample-directory's static namespace imports: this module is evaluated by the browser
  // (the sim calls readSample), so the Node-only imports must stay out of the browser's evaluation path entirely.
  const [fs, path, { getSampleDirectory }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
    import('./sample-directory.js'),
  ])

  const data = await fs.readFile(path.join(getSampleDirectory(), `${name}.${SampleFileExtension}`))
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}

/**
 * Reads the raw, still-encoded bytes of a sample: off disk under Node, over HTTP in the browser. Rejects when the
 * sample has not been downloaded.
 */
export const readSample = (name: string): Promise<ArrayBuffer> => (isBrowser() ? readInBrowser(name) : readInNode(name))
