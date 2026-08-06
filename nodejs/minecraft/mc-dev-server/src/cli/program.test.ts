import { describe, expect, it, vi } from 'vitest'

import { createOutputStream } from '../stream.js'
import { buildProgram, parseSpawn } from './program.js'

import type { CommandContext } from '../start/start.js'

const program = (): {
  run: (argv: string[]) => Promise<void>
  lines: string[]
  contexts: Record<string, CommandContext | undefined>
} => {
  const lines: string[] = []
  const contexts: Record<string, CommandContext | undefined> = {}
  const handler =
    (name: string) =>
    (context: CommandContext): Promise<void> => {
      contexts[name] = context
      return Promise.resolve()
    }

  const command = buildProgram({
    version: '9.9.9',
    stream: createOutputStream((line) => lines.push(line)),
    handlers: { start: vi.fn(handler('start')), stop: vi.fn(handler('stop')), destroy: vi.fn(handler('destroy')) },
    cwd: () => '/ws',
    interactive: () => false,
  })
  command.exitOverride()

  return {
    run: async (argv) => void (await command.parseAsync(['node', 'minecraft-server', ...argv])),
    lines,
    contexts,
  }
}

describe('the command line', () => {
  // d-0yrfifhi — three subcommands, each named explicitly
  it.each(['start', 'stop', 'destroy'])('takes the %s subcommand', async (verb) => {
    const { run, contexts } = program()

    await run([verb])

    expect(contexts[verb]).toBeDefined()
  })

  // d-0yrfifhi — there is no bare default invocation
  it('does nothing when no subcommand is named', async () => {
    const { run, contexts } = program()

    await run([]).catch(() => undefined)

    expect(contexts).toEqual({})
  })

  // d-62bpn2h2 — an unrecognised flag fails the run
  it('fails on an unrecognised flag', async () => {
    const { run } = program()

    await expect(run(['start', '--nope'])).rejects.toThrow()
  })

  // d-62bpn2h2 — --help and --version are answered on every subcommand
  it.each(['--help', '--version'])('answers %s', async (flag) => {
    const { run, lines } = program()

    await run([flag]).catch(() => undefined)

    expect(lines.join('\n')).not.toBe('')
  })

  // d-62bpn2h2 — nothing is written to stderr
  it('writes even its diagnostics to the one stream', async () => {
    const { run, lines } = program()

    await run(['start', '--nope']).catch(() => undefined)

    expect(lines.every((line) => line.startsWith('['))).toBe(true)
  })

  // d-41m3iws5 — the command line is the last override layer
  it('carries the run settings the command line named', async () => {
    const { run, contexts } = program()

    await run([
      'start',
      '--config',
      'elsewhere.yaml',
      '--profile',
      'scripts',
      '--level',
      'dev',
      '--seed',
      '424242',
      '--spawn',
      '1,2,3',
      '--accept-eula',
    ])

    expect(contexts.start).toMatchObject({
      configPath: 'elsewhere.yaml',
      cli: { profile: 'scripts', level: 'dev', seed: 424242n, spawn: [1, 2, 3], acceptEula: true },
    })
  })
})

describe('parseSpawn', () => {
  it('reads x,y,z', () => {
    expect(parseSpawn('1,-2, 3')).toEqual([1, -2, 3])
  })

  it.each(['1,2', 'a,b,c', '1,2,3,4'])('rejects %s', (value) => {
    expect(() => parseSpawn(value)).toThrow()
  })
})
