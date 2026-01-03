import { resolveGlobs } from '../config/glob.js'
import type { BookifyProject } from '../config/model.js'
import { requireTrailingNewline } from '../pandoc.js'
import { pandoc } from '../pandoc/pandoc.js'
import { makeDefaultRendererFactory } from '../renderers/factory.js'
import type { RendererFactoryFn } from '../rendering.js'
import { consoleLogger, type Logger } from '@twin-digital/logger-lib'
import { makeBookifyWatcher, type BookifyWatcherOptions } from './bookify-watcher.js'

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

/**
 * Options for the engine's watch method.
 * Excludes renderHtml, renderPdf, and logger which are provided by the engine.
 */
export type EngineWatchOptions = Omit<BookifyWatcherOptions, 'renderHtml' | 'renderPdf' | 'logger'>

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

  /**
   * Watches a project for file changes and automatically rebuilds outputs.
   * Delegates to makeBookifyWatcher for the actual watch implementation.
   */
  public async watch(project: BookifyProject, options: EngineWatchOptions): Promise<void> {
    return makeBookifyWatcher(project, {
      ...options,
      renderHtml: (proj) => this.renderHtml(proj),
      renderPdf: (proj) => this.renderPdf(proj),
      logger: this._log,
    })
  }
}
