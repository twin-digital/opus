import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { loadConfig, resolveConfig } from '@twin-digital/bookify/config'
import { BookifyEngine } from '@twin-digital/bookify/engine/engine'
import type { EngineWatchOptions } from '@twin-digital/bookify/engine'
import { PreviewServer, type OutputConfig } from '../preview-server/preview-server.js'

export default class Serve extends Command {
  static override description =
    'Watches files and serves generated HTML and PDF files via a web server with live reload'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> --project .bookify.yml',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml --port 8080',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml --html',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml --pdf',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml --html --pdf',
    '<%= config.bin %> <%= command.id %> --css styles.css one.md two.md',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to assemble (not allowed with --project)',
      name: 'files',
      required: false,
    }),
  }

  static override flags = {
    'api-key': Flags.string({
      description: 'EuroPDF API key (required for PDF generation)',
      env: 'EURO_PDF_API_KEY',
      required: false,
    }),
    css: Flags.string({
      default: [],
      description: 'Path to a CSS stylesheet (can be specified multiple times, not allowed with --project)',
      exclusive: ['project'],
      multiple: true,
    }),
    html: Flags.boolean({
      description: 'Serve HTML output (if neither --html nor --pdf specified, both are served)',
    }),
    pdf: Flags.boolean({
      description: 'Serve PDF output (if neither --html nor --pdf specified, both are served)',
    }),
    port: Flags.integer({
      default: 3000,
      description: 'Port number for the web server',
    }),
    project: Flags.string({
      char: 'p',
      description: 'Path to a .bookify.yml project file',
      exclusive: ['css'],
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Serve)

    const outputConfig = this.determineOutputConfig(flags)
    const project = await this.loadOrCreateProject(flags, argv as string[], outputConfig)
    const tmpDir = await this.createTempDirectory()

    outputConfig.htmlPath = outputConfig.serveHtml ? path.join(tmpDir, 'output.html') : undefined
    outputConfig.pdfPath = outputConfig.servePdf ? path.join(tmpDir, 'output.pdf') : undefined

    const server = new PreviewServer(flags.port, outputConfig, (msg) => {
      this.log(msg)
    })
    const engine = this.createEngine()

    const watchOptions = this.createWatchOptions(outputConfig, server)

    // Start server and watch for changes
    await server.start()

    // The engine's watch mode has its own SIGINT handler that will stop watching
    // We just need to stop the server when watch mode exits
    await engine.watch(project, watchOptions)

    // Clean up server when watch mode stops
    await server.stop()
  }

  private determineOutputConfig(flags: { html?: boolean; pdf?: boolean }): OutputConfig {
    const serveHtml = flags.html || flags.pdf ? (flags.html ?? false) : true
    const servePdf = flags.html || flags.pdf ? (flags.pdf ?? false) : true

    if (!serveHtml && !servePdf) {
      this.error('At least one of --html or --pdf must be specified')
    }

    return { serveHtml, servePdf }
  }

  private async loadOrCreateProject(
    flags: { project?: string; 'api-key'?: string; css: string[] },
    argv: string[],
    outputConfig: OutputConfig,
  ) {
    if (flags.project) {
      if (argv.length > 0) {
        this.error('Input files cannot be specified when using --project')
      }
      return loadConfig(flags.project)
    }

    // Ad-hoc project from command line arguments
    if (argv.length === 0) {
      this.error('Either --project or input files must be specified')
    }

    if (outputConfig.servePdf && !flags['api-key']) {
      this.error('--api-key is required for PDF generation when not using --project')
    }

    return resolveConfig({
      css: flags.css,
      inputs: argv,
      pdf:
        outputConfig.servePdf && flags['api-key'] ?
          {
            renderer: 'euro-pdf',
            rendererOptions: {
              apiKey: flags['api-key'],
              test: 'true',
            },
          }
        : undefined,
    })
  }

  private async createTempDirectory(): Promise<string> {
    const tmpDir = path.join(process.cwd(), '.bookify-tmp')
    await fs.mkdir(tmpDir, { recursive: true })
    return tmpDir
  }

  private createEngine(): BookifyEngine {
    return new BookifyEngine({
      logger: {
        error: (msg) => {
          this.logToStderr(msg)
        },
        info: (msg) => {
          this.log(msg)
        },
      },
    })
  }

  private createWatchOptions(config: OutputConfig, server: PreviewServer): EngineWatchOptions {
    return {
      htmlOutputPath: config.htmlPath,
      pdfOutputPath: config.pdfPath,
      onChangeCompleted: () => {
        void server.loadContent()
      },
    }
  }
}
