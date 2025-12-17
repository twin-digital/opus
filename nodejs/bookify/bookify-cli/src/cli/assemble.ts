import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { assembleMarkdown } from '@twin-digital/bookify/pandoc'
import { makeWatcher } from '../utils/watch.js'

export default class Assemble extends Command {
  static override description = 'Assembles loose content sections into a single markdown file'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> foo.md bar.md',
    '<%= config.bin %> <%= command.id %> one.md two.md three.md',
    '<%= config.bin %> <%= command.id %> -o result.md one.md two.md',
    '<%= config.bin %> <%= command.id %> -o result.md --watch one.md two.md',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to assemble',
      name: 'files',
      required: true,
    }),
  }

  static override flags = {
    output: Flags.string({
      char: 'o',
      description: 'Output markdown file path (required when using --watch)',
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
    const { argv, flags } = await this.parse(Assemble)

    const inputFiles = argv as string[]
    const outputPath = flags.output ? path.resolve(process.cwd(), flags.output) : null

    const generateMarkdown = async () => {
      const markdown = await assembleMarkdown(inputFiles)

      if (outputPath) {
        await fs.writeFile(outputPath, markdown, 'utf-8')
      } else {
        this.log(markdown)
      }
    }

    // Initial generation
    await generateMarkdown()

    if (outputPath) {
      this.logToStderr(`Markdown generated: ${outputPath}`)
    }

    if (flags.watch) {
      this.logToStderr('Watching for changes...')

      const watcher = makeWatcher(inputFiles, generateMarkdown, {
        onChangeStarted: (filename) => {
          this.logToStderr(`Change detected in ${filename}, regenerating...`)
        },
        onChangeCompleted: () => {
          this.logToStderr(`Markdown generated: ${outputPath}`)
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
