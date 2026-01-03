import fsP from 'node:fs/promises'
import path from 'node:path'
import { analyzeCssDependencies } from '../engine/css-deps.js'
import { resolveGlobs } from '../config/glob.js'
import type { BookifyProject } from '../config.js'
import { consoleLogger, type Logger } from '@twin-digital/logger-lib'
import { makeWatcher } from '../watcher/watch.js'

export interface BookifyWatcherOptions {
  /** Debounce delay in milliseconds to wait for file changes to settle (default: 250) */
  debounceMs?: number
  /** Callback invoked when a change is detected */
  onChangeStarted?: (filename: string) => void
  /** Callback invoked when change processing completes */
  onChangeCompleted?: () => void
  /** Callback invoked if an error occurs during change handling */
  onError?: (error: unknown) => void
  /** Logger for watch operations */
  logger?: Logger

  /**
   * Absolute path to which the rendered HTML will be written. If not specified, then no HTML output will be produced.
   */
  htmlOutputPath?: string
  /**
   * Absolute path to which the rendered PDF will be written. If not specified, then no PDF output will be produced.
   */
  pdfOutputPath?: string

  /**
   * Render function which will be used to generate HTML output.
   */
  renderHtml: (project: BookifyProject) => Promise<string>

  /**
   * Render function which will be used to generate PDF output.
   */
  renderPdf: (project: BookifyProject) => Promise<ArrayBuffer>
}

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
      const cssDeps = await analyzeCssDependencies(cssFiles, { logger: this.logger })

      // Implicit deps are CSS dependencies minus the explicit CSS files
      const explicitCssSet = new Set(cssFiles)
      this.implicitDeps = cssDeps.filter((dep) => !explicitCssSet.has(dep))

      return this.getAllDependencies()
    } catch (error) {
      this.logger.error(`Failed to analyze CSS dependencies: ${String(error)}`)
      return this.getAllDependencies()
    }
  }

  public getAllDependencies(): string[] {
    return [...this.configuredFiles, ...this.implicitDeps]
  }
}

/**
 * Creates a watcher that monitors a Bookify project and automatically rebuilds outputs when files change.
 * Handles CSS dependency tracking, initial render, and graceful shutdown.
 */
export const makeBookifyWatcher = async (project: BookifyProject, options: BookifyWatcherOptions): Promise<void> => {
  const { htmlOutputPath, pdfOutputPath, renderHtml, renderPdf, logger = consoleLogger, ...watcherOptions } = options

  // Helper to write HTML output
  const writeHtml = async (): Promise<void> => {
    if (!htmlOutputPath) {
      return
    }

    const html = await renderHtml(project)
    await ensureDirectoryExists(htmlOutputPath)
    await fsP.writeFile(htmlOutputPath, html, 'utf-8')
    logger.info(`HTML written to ${htmlOutputPath}`)
  }

  // Helper to write PDF output
  const writePdf = async (): Promise<void> => {
    if (!pdfOutputPath) {
      return
    }

    const pdf = await renderPdf(project)
    await ensureDirectoryExists(pdfOutputPath)
    await fsP.writeFile(pdfOutputPath, Buffer.from(pdf))
    logger.info(`PDF written to ${pdfOutputPath}`)
  }

  // Helper to render all configured outputs
  const renderAll = async (): Promise<void> => {
    const tasks: Promise<void>[] = []
    if (htmlOutputPath) {
      tasks.push(writeHtml())
    }
    if (pdfOutputPath) {
      tasks.push(writePdf())
    }
    await Promise.all(tasks)
  }

  // Perform initial render, but don't fail if it errors - enter watch mode anyway
  try {
    await renderAll()
    options.onChangeCompleted?.()
  } catch (error) {
    logger.error(`Initial render failed: ${String(error)}`)
    logger.info('Entering watch mode anyway - fix the error and save a file to retry')
  }

  logger.info('Watching for changes...')

  const configuredFiles = [...project.inputs, ...project.css]
  const depTracker = new DependencyTracker(configuredFiles, project, logger)

  const updateDependencies = () => {
    void depTracker.updateImplicitDependencies().then((allDeps) => {
      watcher.updateWatchList(allDeps)
    })
  }

  const watcher = makeWatcher(configuredFiles, renderAll, {
    debounceMs: watcherOptions.debounceMs,
    onChangeStarted: (filename) => {
      logger.info(`Change detected in ${filename}, regenerating...`)
      watcherOptions.onChangeStarted?.(filename)
    },
    onChangeCompleted: () => {
      updateDependencies()
      watcherOptions.onChangeCompleted?.()
    },
    onError: (error) => {
      logger.error(`Failed to regenerate: ${String(error)}`)
      // Update dependencies even on error so we can watch for missing files
      updateDependencies()
      watcherOptions.onError?.(error)
    },
    logger,
  })

  await watcher.start()

  // Perform initial CSS dependency analysis
  void depTracker.updateImplicitDependencies().then((allDeps) => {
    watcher.updateWatchList(allDeps)
  })

  // Graceful shutdown on SIGINT
  return new Promise((resolve) => {
    const sigintHandler = () => {
      logger.info('\nStopping watch mode...')
      process.off('SIGINT', sigintHandler)

      // Force exit after 2 seconds if cleanup hangs
      const forceExitTimer = setTimeout(() => {
        logger.info('Cleanup timeout, forcing exit...')
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
