import fsP from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { BookifyEngine } from '@twin-digital/bookify/engine/engine'
import { loadConfig, resolveConfig } from '@twin-digital/bookify/config'
import { ensureDirectoryExists } from '../utils/fs.js'

export default class Transform extends Command {
  static override description =
    'Assembles markdown input files and transforms them to a single HTML file with assets embedded'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> one.md two.md three.md > result.html',
    '<%= config.bin %> <%= command.id %> --format html one.md two.md three.md > result.html',
    '<%= config.bin %> <%= command.id %> --css styles.css --css theme.css one.md two.md > result.html',
    '<%= config.bin %> <%= command.id %> -o result.html --css styles.css one.md two.md',
    '<%= config.bin %> <%= command.id %> -o result.html --css styles.css --watch one.md two.md',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml -o result.html',
    '<%= config.bin %> <%= command.id %> --project .bookify.yml -o result.html --watch',
  ]

  static override args = {
    files: Args.string({
      description: 'Markdown files to assemble (not allowed with --project)',
      name: 'files',
      required: false,
    }),
  }

  static override flags = {
    css: Flags.string({
      default: [],
      description: 'Path to a CSS stylesheet (can be specified multiple times, not allowed with --project)',
      exclusive: ['project'],
      multiple: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output HTML file path (required when using --watch)',
    }),
    project: Flags.string({
      char: 'p',
      description: 'Path to a .bookify.yml project file',
      exclusive: ['css'],
    }),
    watch: Flags.boolean({
      char: 'w',
      dependsOn: ['output'],
      description: 'Watch for changes and rebuild automatically',
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Transform)

    const outputPath = flags.output ? path.resolve(process.cwd(), flags.output) : null

    let project
    if (flags.project) {
      // Validate that no input files were provided
      if (argv.length > 0) {
        this.error('Input files cannot be specified when using --project')
      }
      project = await loadConfig(flags.project)
    } else {
      // Validate that input files were provided
      if (argv.length === 0) {
        this.error('Either --project or input files must be specified')
      }
      project = resolveConfig({
        css: flags.css,
        inputs: argv as string[],
      })
    }

    const engine = new BookifyEngine({
      logger: {
        error: (...args: []) => {
          this.logToStderr(...args)
        },
        info: (...args: []) => {
          this.log(...args)
        },
      },
    })

    if (flags.watch && outputPath) {
      await engine.watch(project, {
        htmlPath: outputPath,
      })
    } else {
      const html = await engine.renderHtml(project)

      if (outputPath) {
        await ensureDirectoryExists(outputPath)
        await fsP.writeFile(outputPath, html, 'utf-8')
      } else {
        this.log(html)
      }
    }
  }
}
