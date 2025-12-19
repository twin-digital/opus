import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { loadConfig, resolveConfig } from '@twin-digital/bookify/config'
import { BookifyEngine } from '@twin-digital/bookify/engine'
import { ensureDirectoryExists } from '../utils/fs.js'

export default class Pdf extends Command {
  static override description = 'Renders a set of markdown files into a publishable PDF'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> --api-key abczzz123 -o result.pdf --css base.css --css theme.css -- foo.md bar.md',
    '<%= config.bin %> <%= command.id %> --api-key abczzz123 -o result.pdf --css base.css --css theme.css --watch -- foo.md bar.md',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml -o result.pdf',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml -o result.pdf --watch',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to render (not allowed with --project)',
      name: 'files',
      required: false,
    }),
  }

  static override flags = {
    'api-key': Flags.string({
      description: 'EuroPDF API key',
      env: 'EURO_PDF_API_KEY',
      required: false,
    }),
    css: Flags.string({
      default: [],
      description: 'Path to a CSS stylesheet (can be specified multiple times, not allowed with --project)',
      exclusive: ['project'],
      multiple: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output PDF file path',
      required: true,
    }),
    project: Flags.string({
      char: 'p',
      description: 'Path to a .bookify.yml project file',
      exclusive: ['css'],
    }),
    watch: Flags.boolean({
      char: 'w',
      default: false,
      description: 'Watch for changes and rebuild automatically',
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Pdf)

    const outputPath = path.resolve(process.cwd(), flags.output)

    let project
    if (flags.project) {
      // Validate that no input files were provided
      if (argv.length > 0) {
        this.error('Input files cannot be specified when using --project')
      }
      project = await loadConfig(flags.project)
    } else {
      // Validate that input files and api-key were provided
      if (argv.length === 0) {
        this.error('Either --project or input files must be specified')
      }
      if (!flags['api-key']) {
        this.error('--api-key is required when not using --project')
      }
      project = resolveConfig({
        css: flags.css,
        inputs: argv as string[],
        pdf: {
          renderer: 'euro-pdf',
          rendererOptions: {
            apiKey: flags['api-key'],
            test: 'true',
          },
        },
      })
    }

    const engine = new BookifyEngine()

    if (flags.watch && outputPath) {
      await engine.watch(project, {
        pdfPath: outputPath,
      })
    } else {
      const pdf = await engine.renderPdf(project)
      await ensureDirectoryExists(outputPath)
      await fs.writeFile(outputPath, Buffer.from(pdf))
    }
  }
}
