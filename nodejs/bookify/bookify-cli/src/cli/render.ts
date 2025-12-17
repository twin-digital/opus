import fs from 'node:fs/promises'
import path from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { renderDocument } from '@twin-digital/bookify/rendering'
import { makeEuroPdfRenderer } from '@twin-digital/bookify/euro-pdf'

export default class Render extends Command {
  static override description = 'Transforms a standalone HTML file (with embedded styles) into a PDF'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> --api-key abczzz123 --output result.pdf input.html ',
  ]

  static override args = {
    input: Args.string({
      description: 'HTML file to transform into PDF',
      required: true,
    }),
  }

  static override flags = {
    'api-key': Flags.string({
      description: 'EuroPDF API key',
      env: 'EUROPDF_API_KEY',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output PDF file path',
      required: true,
    }),
  }

  static override strict = false

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Render)

    const inputPath = path.resolve(process.cwd(), args.input)
    const outputPath = path.resolve(process.cwd(), flags.output)

    const html = await fs.readFile(inputPath, 'utf-8')
    const result = await renderDocument(html, makeEuroPdfRenderer({ apiKey: flags['api-key'] }))
    await fs.writeFile(outputPath, Buffer.from(result))
  }
}
