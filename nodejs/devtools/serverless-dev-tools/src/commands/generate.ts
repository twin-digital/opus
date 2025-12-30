import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Args, Command, Flags } from '@oclif/core'
import { parse, stringify } from 'yaml'
import type { ServerlessConfig } from '../generate-compose/types.js'
import { generateComposeFile } from '../generate-compose/generate-compose.js'

const COMPOSE_HEADER = `# ════════════════════════════════════════════════════════════════════════════
# AUTO-GENERATED FILE - DO NOT EDIT
# ════════════════════════════════════════════════════════════════════════════
# This file is generated from serverless.yml by @twin-digital/serverless-dev-tools
# To make changes, edit serverless.yml and regenerate this file.
# ════════════════════════════════════════════════════════════════════════════

`

export default class Generate extends Command {
  static override description = 'Generate docker-compose.yml from serverless.yml'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o docker-compose.yml',
    '<%= config.bin %> <%= command.id %> serverless.custom.yml',
    '<%= config.bin %> <%= command.id %> | docker-dev -',
  ]

  static override args = {
    serverlessFile: Args.string({
      default: 'serverless.yml',
      description: 'Path to serverless.yml file',
    }),
  }

  static override flags = {
    output: Flags.string({
      char: 'o',
      description: 'Output file path (omit to write to stdout)',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Generate)

    const serverlessPath = resolve(process.cwd(), args.serverlessFile)

    try {
      const serverlessContent = readFileSync(serverlessPath, 'utf-8')
      const serverless = parse(serverlessContent) as ServerlessConfig

      const compose = generateComposeFile(serverless)
      const yamlContent = stringify(compose, {
        aliasDuplicateObjects: true, // Enable anchor/alias for duplicate objects
        lineWidth: 0, // Disable line wrapping
        singleQuote: true,
      })

      const output = COMPOSE_HEADER + yamlContent

      if (flags.output) {
        const outputPath = resolve(process.cwd(), flags.output)
        writeFileSync(outputPath, output)

        const functionNames = Object.keys(serverless.functions)
        this.logToStderr('✅ Generated docker-compose.yml from serverless.yml')
        this.logToStderr(`   Functions: ${functionNames.join(', ')}`)
        this.logToStderr(`   Output: ${outputPath}`)
      } else {
        // Write to stdout for piping
        this.log(output)
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.error(`File not found: ${serverlessPath}`)
      }
      throw error
    }
  }
}
