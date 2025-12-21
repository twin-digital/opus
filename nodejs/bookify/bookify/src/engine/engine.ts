import fsP from 'node:fs/promises'
import path from 'node:path'
import { analyzeCssDependencies } from './css-deps.js'
import { resolveGlobs } from '../config/glob.js'
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
   * Optional callback invoked when a change is detected in a file.
   * @param filename Name of the changed file
   */
  onChangeStarted?: (filename: string) => void

  /**
   * Optional callback invoked when change process is completed.
   */
  onChangeCompleted?: () => void

  /**
   * Optional callback invoked if there is an error handling a change.
   */
  onError?: (error: unknown) => void

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

/**
 * Manages dependency tracking for watch mode, including both explicit
 * configuration files and implicit CSS dependencies.
 */
class DependencyTracker {
  private implicitDeps: string[] = []

  constructor(
    private readonly configuredFiles: string[],
    private readonly project: BookifyProject,
    private readonly logger: Logger,
  ) {}

  public async updateImplicitDependencies(): Promise<string[]> {
    try {
      const cssFiles = await resolveGlobs(this.project.css)
      const cssDeps = await analyzeCssDependencies(cssFiles)

      // Implicit deps are CSS dependencies minus the explicit CSS files
      const explicitCssSet = new Set(cssFiles)
      this.implicitDeps = cssDeps.filter((dep) => !explicitCssSet.has(dep))

      const allDeps = this.getAllDependencies()
      this.logger.info(
        `Watching ${allDeps.length} files (${this.configuredFiles.length} configured, ${this.implicitDeps.length} CSS imports)`,
      )

      return allDeps
    } catch (error) {
      this.logger.error(`Failed to analyze CSS dependencies: ${String(error)}`)
      return this.getAllDependencies()
    }
  }

  public getAllDependencies(): string[] {
    return [...this.configuredFiles, ...this.implicitDeps]
  }
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
  public async renderHtml(project: BookifyProject): Promise<string> {
    // Resolve any glob patterns in inputs and CSS to actual file paths
    const [inputs, css] = await Promise.all([resolveGlobs(project.inputs), resolveGlobs(project.css)])

    return pandoc({
      extraArgs: {
        css,
        embedResources: true,
        resourcePath: project.assetPaths.join(':'),
        standalone: true,
      },
      inputFiles: inputs,
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

  public async watch(project: BookifyProject, options: WatchOptions): Promise<void> {
    const { htmlPath, pdfPath, ...watcherOptions } = options

    await this._performInitialRender(htmlPath, pdfPath, project)
    options.onChangeCompleted?.()

    return this._startWatchMode(project, htmlPath, pdfPath, watcherOptions)
  }

  private async _performInitialRender(
    htmlPath: string | undefined,
    pdfPath: string | undefined,
    project: BookifyProject,
  ): Promise<void> {
    const tasks: Promise<void>[] = []

    if (htmlPath) {
      tasks.push(this._writeHtml(project, htmlPath))
    }

    if (pdfPath) {
      tasks.push(this._writePdf(project, pdfPath))
    }

    await Promise.all(tasks)
  }

  private async _writeHtml(project: BookifyProject, outputPath: string): Promise<void> {
    const html = await this.renderHtml(project)
    await ensureDirectoryExists(outputPath)
    await fsP.writeFile(outputPath, html, 'utf-8')
    this._log.info(`HTML written to ${outputPath}`)
  }

  private async _writePdf(project: BookifyProject, outputPath: string): Promise<void> {
    const pdf = await this.renderPdf(project)
    await ensureDirectoryExists(outputPath)
    await fsP.writeFile(outputPath, Buffer.from(pdf))
    this._log.info(`PDF written to ${outputPath}`)
  }

  private async _startWatchMode(
    project: BookifyProject,
    htmlPath: string | undefined,
    pdfPath: string | undefined,
    watcherOptions: Omit<WatchOptions, 'htmlPath' | 'pdfPath'>,
  ): Promise<void> {
    return new Promise((resolve) => {
      this._log.info('Watching for changes...')

      const configuredFiles = [...project.inputs, ...project.css]
      const depTracker = new DependencyTracker(configuredFiles, project, this._log)

      const renderAll = async () => {
        this._log.info('[RENDER] Starting regeneration...')
        const tasks: Promise<void>[] = []
        if (htmlPath) {
          tasks.push(this._writeHtml(project, htmlPath))
        }

        if (pdfPath) {
          tasks.push(this._writePdf(project, pdfPath))
        }

        await Promise.all(tasks)
        this._log.info('[RENDER] Regeneration complete')
      }

      const watcher = makeWatcher(configuredFiles, renderAll, {
        debounceMs: watcherOptions.debounceMs,
        onChangeStarted: (filename) => {
          this._log.info(`Change detected in ${filename}, regenerating...`)
          watcherOptions.onChangeStarted?.(filename)
        },
        onChangeCompleted: () => {
          void depTracker.updateImplicitDependencies().then((allDeps) => {
            watcher.updateWatchList(allDeps)
          })
          watcherOptions.onChangeCompleted?.()
        },
        onError: (error) => {
          this._log.error(`Failed to regenerate: ${String(error)}`)
          watcherOptions.onError?.(error)
        },
      })

      watcher.start()

      // Perform initial CSS dependency analysis
      void depTracker.updateImplicitDependencies().then((allDeps) => {
        watcher.updateWatchList(allDeps)
      })

      // Graceful shutdown on SIGINT (register once)
      const sigintHandler = () => {
        this._log.info('\nStopping watch mode...')
        // Remove handler to prevent multiple invocations
        process.off('SIGINT', sigintHandler)

        // Force exit after 2 seconds if cleanup hangs
        const forceExitTimer = setTimeout(() => {
          this._log.info('Cleanup timeout, forcing exit...')
          process.exit(0)
        }, 2000)

        void watcher.stop().then(() => {
          clearTimeout(forceExitTimer)
          resolve()
        })
      }
      process.once('SIGINT', sigintHandler)
    })
  }
}
