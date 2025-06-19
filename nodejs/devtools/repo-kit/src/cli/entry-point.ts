import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'

const importTopLevelFunction = async (
  modulePath: string,
  functionName: string,
): Promise<(...args: any[]) => unknown> => {
  const mod = (await import(modulePath)) as Record<string, unknown>

  if (!(functionName in mod)) {
    throw new Error(
      `Invalid command module: no top-level ${functionName} function. [module=${modulePath}]`,
    )
  }

  if (typeof mod[functionName] !== 'function') {
    throw new Error(
      `Invalid command module: ${functionName} was not a function. [module=${modulePath}]`,
    )
  }

  return mod[functionName] as (...args: any[]) => unknown
}

const registerCommands = async (program: Command) => {
  const commandModules = fs
    .readdirSync(path.join(import.meta.dirname, 'commands'))
    .filter((name) => name.endsWith('.js'))

  for (const commandModule of commandModules) {
    const modulePath = `./commands/${commandModule}`
    const makeCommand = await importTopLevelFunction(modulePath, 'makeCommand')

    const command = makeCommand()
    if (command instanceof Command) {
      program.addCommand(command)
    } else {
      throw new Error(
        `Invalid command module: "makeCommand" did not return a Command object. [module=${modulePath}]`,
      )
    }
  }
}

const main = async () => {
  const packageJson = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, '..', '..', 'package.json'),
      'utf-8',
    ),
  ) as { version: string | undefined }

  const program = new Command()
    .name('repo-kit')
    .version(packageJson.version ?? 'unknown')

  await registerCommands(program)
  await program.parseAsync(process.argv)
}

main().catch((err) => {
  console.error(err)
  console.error(
    '--------------------------------------------------------------------------------------------------------------',
  )
  console.error(
    `Command failed: ${err instanceof Error ? err.message : String(err)}`,
  )
  console.error('See previous output for more details.')
  process.exit(1)
})
