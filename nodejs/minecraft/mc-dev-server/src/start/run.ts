import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { loadConfig } from '../config/load.js'
import {
  createComposeClient,
  createComposeFollower,
  createComposeRunner,
  DockerUnavailableError,
} from '../docker/compose.js'
import { EulaNotAcceptedError, writeComposeFile } from '../docker/compose-file.js'
import { DEFAULT_LEVEL, resolveSettings } from '../settings/resolve.js'
import { resolveWorkspace } from '../workspace.js'

import type { ComposeClient } from '../docker/compose.js'
import type { ComposeProjectSpec } from '../docker/compose-file.js'
import type { CommandLineSettings, RunSettings } from '../settings/resolve.js'
import type { OutputStream } from '../stream.js'
import type { Workspace } from '../workspace.js'

/** How long a console stop is given before the harness gives up on it. */
export const STOP_TIMEOUT_MS = 130_000
/** How long a world load is waited for. Generating a fresh world is the slow case. */
export const READINESS_TIMEOUT_MS = 300_000

/** What every command takes from the command line and its environment. */
export interface CommandContext {
  cwd: string
  configPath?: string
  stream: OutputStream
  cli: CommandLineSettings
  /** whether the run can ask the author a question */
  interactive: boolean
  /** seams a test replaces; a run makes its own */
  deps?: CommandDeps
}

/** The seams a command is driven through in a test. */
export interface CommandDeps {
  /** the compose client for a generated project; the real one writes the file and shells out */
  compose?: (spec: ComposeProjectSpec) => Promise<ComposeClient>
  /** asks the author a yes/no question */
  confirm?: (question: string) => Promise<boolean>
  /** resolves when the foreground loop should close */
  waitForSignal?: () => Promise<void>
  /** the Docker connection the environment selected, for the endpoint the run reports */
  dockerHost?: string
  /** how often readiness re-reads the container log */
  readinessPollMs?: number
}

/** The workspace, the config, and the settings a run carries — everything decided before Docker. */
export interface ResolvedRun {
  workspace: Workspace
  settings: RunSettings
  /** the config file that applied, where one did */
  configFile?: string
}

/** Resolves the workspace and folds the settings layers. Nothing here touches Docker. */
export const resolveRun = async (context: CommandContext): Promise<ResolvedRun> => {
  const workspace = await resolveWorkspace(context.cwd)
  const loaded = await loadConfig(context.cwd, context.configPath)
  return {
    workspace,
    settings: resolveSettings(loaded.config, context.cli),
    ...(loaded.path === undefined ? {} : { configFile: loaded.path }),
  }
}

/** Builds the compose client for a run, writing the generated project first. */
export const composeFor = async (context: CommandContext, spec: ComposeProjectSpec): Promise<ComposeClient> => {
  const make = context.deps?.compose
  if (make !== undefined) {
    return make(spec)
  }
  const file = await writeComposeFile(spec)
  return createComposeClient(createComposeRunner(file), createComposeFollower(file))
}

/** The generated project a run stands up. */
export const projectSpec = (run: ResolvedRun, level: string, seed: bigint): ComposeProjectSpec => ({
  project: run.workspace.project,
  image: run.settings.image,
  port: run.settings.port,
  level,
  seed,
})

/** The world a command addresses when it is not the start ladder deciding. */
export const levelOrDefault = (settings: RunSettings): string => settings.level ?? DEFAULT_LEVEL

/** Fails the run where the EULA was accepted neither on the command line nor in the config. */
export const requireEula = (settings: RunSettings): void => {
  if (!settings.eula) {
    throw new EulaNotAcceptedError()
  }
}

/** Wraps a first contact with the daemon, so an unreachable one fails as what it is. */
export const withDaemon = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work()
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      throw error
    }
    throw new DockerUnavailableError(`the Docker daemon could not be reached: ${(error as Error).message}`)
  }
}

/** Reads a workspace package's manifest, to see which scripts it declares. */
export const readPackageManifest = async (
  workspaceRoot: string,
  packageDir: string,
): Promise<{ scripts?: Record<string, string> }> => {
  try {
    return JSON.parse(await readFile(join(workspaceRoot, packageDir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
  } catch {
    return {}
  }
}
