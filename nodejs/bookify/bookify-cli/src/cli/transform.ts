import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { transformMarkdown } from '@twin-digital/bookify/pandoc'
import { makeWatcher } from '../utils/watch.js'

export default class Transform extends Command {
  static override description =
    'Assembles markdown input files and transforms them to a single HTML file with assets embedded'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> one.md two.md three.md > result.html',
    '<%= config.bin %> <%= command.id %> --format html one.md two.md three.md > result.html',
    '<%= config.bin %> <%= command.id %> --css styles.css --css theme.css one.md two.md > result.html',
    '<%= config.bin %> <%= command.id %> -o result.html --css styles.css one.md two.md',
    '<%= config.bin %> <%= command.id %> -o result.html --css styles.css --watch one.md two.md',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to assemble',
      name: 'files',
      required: true,
    }),
  }

  static override flags = {
    css: Flags.string({
      default: [],
      description: 'Path to a CSS stylesheet (can be specified multiple times)',
      multiple: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output HTML file path (required when using --watch)',
    }),
    watch: Flags.boolean({
      char: 'w',
      default: false,
      dependsOn: ['output'],
      description: 'Watch for changes and rebuild automatically',
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Transform)

    const inputFiles = argv as string[]
    const stylesheets = flags.css.map((cssPath) => path.resolve(cssPath))
    const outputPath = flags.output ? path.resolve(process.cwd(), flags.output) : null

    const generateHtml = async () => {
      const html = await transformMarkdown(inputFiles, stylesheets)

      if (outputPath) {
        await fs.writeFile(outputPath, html, 'utf-8')
      } else {
        this.log(html)
      }
    }

    // Initial generation
    await generateHtml()

    if (outputPath) {
      this.logToStderr(`HTML generated: ${outputPath}`)
    }

    if (flags.watch) {
      this.logToStderr('Watching for changes...')

      const watchedFiles = [...inputFiles, ...stylesheets]

      const watcher = makeWatcher(watchedFiles, generateHtml, {
        onChangeStarted: (filename) => {
          this.logToStderr(`Change detected in ${filename}, regenerating...`)
        },
        onChangeCompleted: () => {
          this.logToStderr(`HTML generated: ${outputPath}`)
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
