import { Command, Option } from 'commander'

import { parseSeed } from '../seed.js'

import type { Spawn } from '../config/types.js'
import type { CommandLineSettings } from '../settings/resolve.js'
import type { CommandContext } from '../start/run.js'
import type { OutputStream } from '../stream.js'

/** The three verbs, each named explicitly — there is no bare default invocation. */
export type Verb = 'start' | 'stop' | 'destroy'

/** What the program does once its flags are parsed. */
export interface CommandHandlers {
  start(context: CommandContext): Promise<void>
  stop(context: CommandContext): Promise<void>
  destroy(context: CommandContext): Promise<void>
}

/** `--spawn x,y,z`. */
export const parseSpawn = (value: string): Spawn => {
  const parts = value.split(',').map((part) => part.trim())
  if (parts.length !== 3 || parts.some((part) => !/^[+-]?\d+$/.test(part))) {
    throw new Error(`--spawn takes three whole numbers as x,y,z, not '${value}'`)
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

interface RawOptions {
  config?: string
  profile?: string
  level?: string
  seed?: bigint
  spawn?: Spawn
  image?: string
  port?: number
  acceptEula?: boolean
}

/** Splits the parsed flags into the config path and the command line's settings layer. */
export const toCommandLine = (options: RawOptions): { configPath?: string; cli: CommandLineSettings } => {
  const { config, ...rest } = options
  return { ...(config === undefined ? {} : { configPath: config }), cli: rest }
}

/**
 * The command line: `minecraft-server` with `start`, `stop` and `destroy`. `--help` and
 * `--version` are answered on every subcommand, and an unrecognised flag fails the run.
 */
export const buildProgram = (deps: {
  version: string
  stream: OutputStream
  handlers: CommandHandlers
  cwd: () => string
  interactive: () => boolean
}): Command => {
  const program = new Command()

  program
    .name('minecraft-server')
    .description("Runs a Minecraft Bedrock dev server and keeps the workspace's built packs deployed to it.")
    .version(deps.version)

  // every line the harness emits goes to the one tagged stream on stdout, diagnostics included
  program.configureOutput({
    writeOut: (text) => {
      deps.stream.write('deploy', text)
    },
    writeErr: (text) => {
      deps.stream.write('deploy', text)
    },
  })

  const context = (options: RawOptions): CommandContext => {
    const { configPath, cli } = toCommandLine(options)
    return {
      cwd: deps.cwd(),
      ...(configPath === undefined ? {} : { configPath }),
      stream: deps.stream,
      cli,
      interactive: deps.interactive(),
    }
  }

  const withConfig = (command: Command): Command =>
    command.option('--config <path>', 'the config file to read instead of the default location')

  const startCommand = withConfig(
    program.command('start').description('bring the server up and watch, or attach to one already running'),
  )
  startCommand
    .option('--profile <name>', 'the profile whose packs and world the run takes')
    .option('--level <name>', 'the world to serve')
    .addOption(new Option('--seed <seed>', 'the seed a generated world comes from').argParser(parseSeed))
    .addOption(new Option('--spawn <x,y,z>', 'where a joining player arrives').argParser(parseSpawn))
    .option('--image <ref>', 'the server image tag')
    .addOption(new Option('--port <port>', 'the published port').argParser((value) => Number(value)))
    .option('--accept-eula', 'accept the Minecraft End User Licence Agreement')
    .action(async (options: RawOptions) => {
      await deps.handlers.start(context(options))
    })

  withConfig(program.command('stop').description('take the container down, keeping every world on the volume')).action(
    async (options: RawOptions) => {
      await deps.handlers.stop(context(options))
    },
  )

  withConfig(program.command('destroy').description('remove the volume and every world on it')).action(
    async (options: RawOptions) => {
      await deps.handlers.destroy(context(options))
    },
  )

  return program
}
