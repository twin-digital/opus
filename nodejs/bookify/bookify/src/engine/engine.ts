import fsP from 'node:fs/promises'
import path from 'node:path'
import type { BookifyProject } from '../config/model.js'
import { requireTrailingNewline } from '../pandoc.js'
import { pandoc } from '../pandoc/pandoc.js'
import { makeDefaultRendererFactory } from '../renderers/factory.js'
import type { RendererFactoryFn } from '../rendering.js'
import { consoleLogger, type Logger } from '../log.js'
import { makeWatcher } from './watch.js'

export interface EngineOptions {
  /**
   * Logger implementation
   * @defaultValue log to the console
   */
  logger?: Logger

  /**
   * Factory used to create pdf renderers.
   * @defaultValue factory able to construct any of the builtin renderer types
   */
  rendererFactory?: RendererFactoryFn
}

interface BaseWatchOptions {
  /**
   * Debounce delay, in ms, to wait for file changes to settle.
   * @defaultValue 250
   */
  debounceMs?: number

  /**
   * Path (absolute or relative to cwd) at which a new HTML rendering will be written whenever changes are detected. If
   * this value is not specified, an HTML output will not be generated. At least one of `htmlPath` or `pdfPath` is
   * required.
   */
  htmlPath?: string

  /**
   * Path (absolute or relative to cwd) at which a new PDF rendering will be written whenever changes are detected. If
   * this value is not specified, an HTML output will not be generated.At least one of `htmlPath` or `pdfPath` is
   * required.
   */
  pdfPath?: string
}

type WatchOptionsWithHtml = BaseWatchOptions & {
  htmlPath: string
}

type WatchOptionsWithPdf = BaseWatchOptions & {
  pdfPath: string
}

/**
 * Options used to configure how a watch is performed.
 */
export type WatchOptions = WatchOptionsWithHtml | WatchOptionsWithPdf

/**
 * Ensures that the parent directory of the specified file exists.
 */
const ensureDirectoryExists = async (filePath: string): Promise<void> => {
  const parent = path.dirname(path.resolve(filePath))
  await fsP.mkdir(parent, { recursive: true })
}

export class BookifyEngine {
  private _log: Logger
  private _makeRenderer: RendererFactoryFn

  /**
   * Constructs a new engine with the given renderer factory.
   * @defaultValue A default factory able to construct any of the builtin renderer types
   */
  public constructor(options: EngineOptions = {}) {
    this._log = options.logger ?? consoleLogger
    this._makeRenderer = options.rendererFactory ?? makeDefaultRendererFactory()
  }

  /**
   * Renders an HTML preview for the specified project, return the HTML content as a string.
   */
  public renderHtml(project: BookifyProject): Promise<string> {
    return pandoc({
      extraArgs: {
        css: project.css,
        embedResources: true,
        resourcePath: project.assetPaths.join(':'),
        standalone: true,
      },
      inputFiles: project.inputs,
      outputFormat: 'html5',
      preprocessors: {
        markdown: requireTrailingNewline,
      },
    })
  }

  /**
   * Renders a final PDF for the specified project, returning its content as an ArrayBuffer.
   */
  public async renderPdf(project: BookifyProject): Promise<ArrayBuffer> {
    const renderer = this._makeRenderer(project.pdf.renderer, project.pdf.rendererOptions)
    const html = await this.renderHtml(project)

    return renderer(html)
  }

  public async watch(project: BookifyProject, { htmlPath, pdfPath, ...watcherOptions }: WatchOptions): Promise<void> {
    const renderHtml = async () => {
      if (htmlPath) {
        const html = await this.renderHtml(project)
        await ensureDirectoryExists(htmlPath)
        await fsP.writeFile(htmlPath, html, 'utf-8')

        this._log.error(`HTML regenerated ${htmlPath}`)
      }
    }

    const renderPdf = async () => {
      if (pdfPath) {
        const pdf = await this.renderPdf(project)
        await ensureDirectoryExists(pdfPath)
        await fsP.writeFile(pdfPath, Buffer.from(pdf))

        this._log.error(`PDF regenerated ${pdfPath}`)
      }
    }

    const renderAll = async () => {
      await Promise.all([renderHtml(), renderPdf()])
    }

    await renderAll()

    return new Promise((resolve) => {
      this._log.error('Watching for changes...')

      const watchedFiles = [...project.inputs, ...project.css]

      const watcher = makeWatcher(watchedFiles, renderAll, {
        ...watcherOptions,
        onChangeStarted: (filename) => {
          this._log.error(`Change detected in ${filename}, regenerating...`)
        },
        onError: (error) => {
          this._log.error(`Failed to regenerate: ${String(error)}`)
        },
      })

      watcher.start()

      // Keep process alive
      process.on('SIGINT', () => {
        this._log.error('\nStopping watch mode...')
        watcher.stop()
        resolve()
      })
    })
  }
}
