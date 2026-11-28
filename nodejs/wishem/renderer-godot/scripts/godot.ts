import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasScriptError } from '../src/runner/script-error.ts'
import { createDockerCli, ensureImage, type DockerCli } from '../src/runner/docker.ts'
import { runGodot } from '../src/runner/run-godot.ts'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const dockerDir = join(packageDir, 'docker')
const godotDir = join(packageDir, 'godot')

const log = (line: string) => {
  console.log(line)
}

const fail = (error: unknown): never => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

/** Runs the GDScript tests in a container. Gives 1 when the output has a script error, else the exit code of Godot. */
const runGdscriptTests = async (docker: DockerCli, tag: string): Promise<number> => {
  const container = `wishem-godot-test-${process.pid}`
  if (
    docker.run([
      'create',
      '--name',
      container,
      tag,
      'godot',
      '--headless',
      '--path',
      '/srv/godot',
      '--script',
      'res://tests/run.gd',
    ]) === undefined
  ) {
    throw new Error('The creation of the container failed.')
  }
  try {
    if (docker.run(['cp', godotDir, `${container}:/srv/godot`]) === undefined) {
      throw new Error('The copy of the Godot project failed.')
    }
    const child = docker.spawn(['start', '--attach', container])
    const exited = new Promise<number>((resolve) => {
      child.once('exit', (code) => {
        resolve(code ?? 1)
      })
    })
    const watch = async (input: NodeJS.ReadableStream, write: (line: string) => void) => {
      let found = false
      for await (const line of createInterface({ input })) {
        write(line)
        found ||= hasScriptError(line)
      }
      return found
    }
    const found = await Promise.all([watch(child.stdout, log), watch(child.stderr, console.error)])
    const code = await exited
    if (found.some(Boolean)) {
      log('wishem-godot tests: SCRIPT ERROR in the output')
      return 1
    }
    return code
  } finally {
    docker.run(['rm', '--force', container])
  }
}

/** Runs the application until `SIGINT` or `SIGTERM`, or until Godot ends. Gives the exit code. */
const runApplication = async (args: string[]): Promise<number> => {
  const { values } = parseArgs({ args, options: { 'hub-port': { type: 'string' } } })
  const port = values['hub-port'] === undefined ? undefined : Number(values['hub-port'])
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('--hub-port must be a number from 1 to 65535')
  }
  const run = await runGodot(port === undefined ? {} : { hubPort: port })
  const stopped = new Promise<number>((resolve) => {
    const stop = () => {
      void run.close().then(() => {
        resolve(0)
      })
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  const code = await Promise.race([stopped, run.exited])
  await run.close()
  return code
}

const command = process.argv[2]

try {
  const docker = createDockerCli()
  if (command === 'image') {
    ensureImage(docker, dockerDir, log)
  } else if (command === 'test') {
    process.exitCode = await runGdscriptTests(docker, ensureImage(docker, dockerDir, log))
  } else if (command === 'run') {
    process.exitCode = await runApplication(process.argv.slice(3))
  } else {
    fail(`Unknown command: ${command}. Use image, test, or run.`)
  }
} catch (error) {
  fail(error)
}
