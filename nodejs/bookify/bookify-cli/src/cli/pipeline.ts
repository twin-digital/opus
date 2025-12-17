import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { transformMarkdown } from '@twin-digital/bookify/pandoc'
import { renderDocument } from '@twin-digital/bookify/rendering'
import { makeEuroPdfRenderer } from '@twin-digital/bookify/euro-pdf'
import { makeWatcher } from '../utils/watch.js'

export default class Pipeline extends Command {
  static override description = 'Renders a set of markdown files into a publishable PDF'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> --api-key abczzz123 -o result.pdf --css base.css --css theme.css -- foo.md bar.md',
    '<%= config.bin %> <%= command.id %> --api-key abczzz123 -o result.pdf --css base.css --css theme.css --watch -- foo.md bar.md',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to render',
      name: 'files',
      required: true,
    }),
  }

  static override flags = {
    'api-key': Flags.string({
      description: 'EuroPDF API key',
      env: 'EUROPDF_API_KEY',
      required: true,
    }),
    css: Flags.string({
      default: [],
      description: 'Path to a CSS stylesheet (can be specified multiple times)',
      multiple: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output PDF file path',
      required: true,
    }),
    watch: Flags.boolean({
      char: 'w',
      default: false,
      description: 'Watch for changes and rebuild automatically',
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Pipeline)

    const inputFiles = argv as string[]
    const outputPath = path.resolve(process.cwd(), flags.output)
    const cssFiles = flags.css.map((cssPath) => path.resolve(cssPath))

    const generatePdf = async () => {
      const html = await transformMarkdown(inputFiles, cssFiles)
      const result = await renderDocument(html, makeEuroPdfRenderer({ apiKey: flags['api-key'], test: true }))
      await fs.writeFile(outputPath, Buffer.from(result))
    }

    // Initial generation
    await generatePdf()
    this.logToStderr(`PDF generated: ${outputPath}`)

    if (flags.watch) {
      this.logToStderr('Watching for changes...')

      const watchedFiles = [...inputFiles, ...cssFiles]

      const watcher = makeWatcher(watchedFiles, generatePdf, {
        onChangeStarted: (filename) => {
          this.logToStderr(`Change detected in ${filename}, regenerating...`)
        },
        onChangeCompleted: () => {
          this.logToStderr(`PDF generated: ${outputPath}`)
        },
        onError: (error) => {
          this.error(`Failed to regenerate: ${String(error)}`)
        },
      })

      watcher.start()

      // Keep process alive
      process.on('SIGINT', () => {
        this.logToStderr('\nStopping watch mode...')
        watcher.stop()
        process.exit(0)
      })
    }
  }
}
