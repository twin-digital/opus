import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { discoverPacks } from '@twin-digital/mc-dev-kit'

import { declaresScript, packageManagerFor, runBuild, startWatch } from '../package-scripts/scripts.js'
import { confirmOnStdin } from '../cli/confirm.js'
import { createReconcileQueue, invalidSelected, invalidSelectionMessage } from '../deploy/reconcile.js'
import { setWorldSpawn, stopServer } from '../server/console.js'
import { connectionLine } from '../server/endpoint.js'
import { worldDir } from '../server/layout.js'
import { lastPackStack, markLog, waitForWorldLoad } from '../server/readiness.js'
import { readWorldsRecord, withWorld, writeWorldsRecord } from '../server/seed-record.js'
import { readRunningServer } from '../server/state.js'
import { formatSeed, randomSeed } from '../seed.js'
import { DEFAULT_LEVEL, selectPacks, SelectionError } from '../settings/resolve.js'
import { watchBuiltOutput } from '../watch/output-watcher.js'
import { acquireAttachLock } from './attach-lock.js'
import { decideStartAction } from './ladder.js'
import {
  composeFor,
  projectSpec,
  READINESS_TIMEOUT_MS,
  readPackageManifest,
  requireEula,
  resolveRun,
  STOP_TIMEOUT_MS,
  withDaemon,
} from './run.js'

import type { WatchProcess } from '../package-scripts/scripts.js'
import type { ReconcileContext } from '../deploy/reconcile.js'
import type { ComposeClient } from '../docker/compose.js'
import type { PackStackLine } from '../server/readiness.js'
import type { OutputStream } from '../stream.js'
import type { CommandContext, ResolvedRun } from './run.js'
import type { ValidPackEntry } from '@twin-digital/mc-dev-kit'

export type { CommandContext, CommandDeps } from './run.js'

/** The run stopped rather than doing something destructive it could not get an answer for. */
export class BailedOutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BailedOutError'
  }
}

/**
 * Reports what a world load actually brought up. `Pack Stack - None` is a start that looks healthy
 * with no packs in it, which is what an unlisted or misrouted pack produces, so it is reported
 * loudly rather than passed over.
 *
 * A running server whose log no longer holds a world-load line counts as ready, and the run says
 * that readiness could not be confirmed rather than waiting for a load that already happened.
 */
export const reportPackStack = (stream: OutputStream, line: PackStackLine | undefined): void => {
  if (line === undefined) {
    stream.write('deploy', 'no world-load line was found in the log the server keeps')
    stream.write('deploy', 'readiness could not be confirmed from the log; treating the server as ready')
    return
  }
  stream.write('deploy', `world loaded: ${line.line}`)
  if (line.none) {
    stream.write('deploy', 'the world loaded with NO packs active — nothing this run hosts is live in it')
  }
}

/**
 * Brings the server up and watches, or attaches to one already running.
 *
 * A run fails before bringing anything up when a selected pack is one the kit reports invalid,
 * when there is no Docker or no reachable daemon, when a `--config` file will not parse, when the
 * EULA has not been accepted, or when the selection names something the workspace does not hold.
 * Everything short of that is reported on the stream and carried: a build that failed leaves its
 * pack deployed with a stub, a package declaring no `watch` script is built once and not watched,
 * and a watch process that exits is reported and not restarted.
 *
 * Resolves when the foreground loop is closed by a signal, having left the server running.
 */
export const start = async (context: CommandContext): Promise<void> => {
  const run = await resolveRun(context)
  const { settings, workspace } = run

  requireEula(settings)

  // a run hosts what was asked for or it does not start
  const discovered = await discoverPacks({ workspace: workspace.root })
  const selected = selectPacks(discovered, settings.packs)
  const invalid = invalidSelected(selected)
  if (invalid.length > 0) {
    throw new SelectionError(invalidSelectionMessage(invalid))
  }

  const lock = await acquireAttachLock(workspace.project)
  try {
    await attached(context, run, selected as readonly ValidPackEntry[])
  } finally {
    await lock.release()
  }
}

/** Walks the start ladder, then hands over to the foreground loop. */
const attached = async (
  context: CommandContext,
  run: ResolvedRun,
  selected: readonly ValidPackEntry[],
): Promise<void> => {
  const { stream } = context
  const { settings, workspace } = run
  const seed = settings.seed ?? randomSeed()

  // the generated project is rewritten once the ladder names the world; its path does not move
  const compose = await composeFor(context, projectSpec(run, settings.level ?? DEFAULT_LEVEL, seed))
  const running = await withDaemon(async () => readRunningServer(compose))

  const action = decideStartAction(
    {
      ...(settings.level === undefined ? {} : { level: settings.level }),
      ...(settings.seed === undefined ? {} : { seed: settings.seed }),
      image: settings.image,
      port: settings.port,
    },
    running,
  )

  /** Runs whatever causes a world load, and waits for the load it caused and not an older one. */
  const loading = async (act: () => Promise<void>): Promise<void> => {
    const mark = await markLog(compose)
    await act()
    reportPackStack(stream, await waitForWorldLoad(compose, mark, READINESS_TIMEOUT_MS, context.deps?.readinessPollMs))
  }

  const restartServer = async (): Promise<void> => {
    await stopServer(compose, STOP_TIMEOUT_MS)
    await loading(async () => compose.up())
  }

  /**
   * Records the seed a world was generated from, once the container is up and before readiness is
   * waited on. A world already on record keeps the seed it has: that is immutable history, and the
   * server ignores the level seed for a world that already exists. `regenerated` is the one case
   * that overwrites, because there the world really is being made again.
   */
  const recordSeed = async (level: string, regenerated = false): Promise<void> => {
    const record = await readWorldsRecord(compose)
    if (!regenerated && Object.hasOwn(record.worlds, level)) {
      return
    }
    await writeWorldsRecord(compose, withWorld(record, level, seed))
    stream.write('deploy', `recorded '${level}' as generated from seed ${formatSeed(seed)}`)
  }

  let level: string
  switch (action.kind) {
    case 'start': {
      level = action.level
      stream.write('deploy', `no server is running for '${workspace.project}'; bringing one up on world '${level}'`)
      await composeFor(context, projectSpec(run, level, seed))
      await loading(async () => {
        await compose.up()
        await recordSeed(level)
      })
      break
    }
    case 'attach': {
      level = running?.level ?? settings.level ?? DEFAULT_LEVEL
      stream.write('deploy', `attaching to the running server for '${workspace.project}' on world '${level}'`)
      reportPackStack(stream, lastPackStack(await compose.logs()))
      break
    }
    case 'recreate': {
      level = action.level
      stream.write('deploy', `recreating the container: ${action.reason}; connected clients are dropped`)
      await composeFor(context, projectSpec(run, level, seed))
      await loading(async () => {
        await compose.recreate()
        if (action.generate) {
          await recordSeed(level)
        }
      })
      break
    }
    case 'confirm-regenerate': {
      level = action.level
      const held = action.recordedSeed === undefined ? 'no seed on record' : `seed ${formatSeed(action.recordedSeed)}`
      stream.write(
        'deploy',
        `the world '${level}' has ${held}; this run asks for seed ${formatSeed(action.requestedSeed)}`,
      )
      stream.write('deploy', `regenerating it destroys the world '${level}' and everything in it`)
      if (!context.interactive) {
        throw new BailedOutError(`nothing can be asked here, so the world '${level}' was left alone`)
      }
      const ask = context.deps?.confirm ?? ((question: string) => confirmOnStdin(question, stream))
      if (!(await ask(`regenerate the world '${level}' from seed ${formatSeed(action.requestedSeed)}?`))) {
        throw new BailedOutError(`the world '${level}' was left alone`)
      }
      await composeFor(context, projectSpec(run, level, seed))
      await stopServer(compose, STOP_TIMEOUT_MS)
      await compose.exec(['rm', '-rf', worldDir(level)])
      await loading(async () => {
        await compose.recreate()
        await recordSeed(level, true)
      })
      break
    }
  }

  stream.write('deploy', connectionLine(settings.port, context.deps?.dockerHost ?? process.env.DOCKER_HOST))

  if (settings.spawn !== undefined) {
    await setWorldSpawn(compose, settings.spawn)
    stream.write('deploy', `set the world spawn to ${settings.spawn.join(', ')}`)
  }

  await foreground(context, run, selected, compose, level, restartServer)
}

/** Builds once, deploys, watches, and follows the container log until a signal closes the loop. */
const foreground = async (
  context: CommandContext,
  run: ResolvedRun,
  selected: readonly ValidPackEntry[],
  compose: ComposeClient,
  level: string,
  restart: () => Promise<void>,
): Promise<void> => {
  const { stream } = context
  const { settings, workspace } = run
  const manager = packageManagerFor(workspace.root)

  // one entry per selected package, whichever kinds of pack it holds
  const packages = [...new Map(selected.map((entry) => [entry.packageName, entry])).values()]
  const manifests = new Map(
    await Promise.all(
      packages.map(
        async (entry) => [entry.packageName, await readPackageManifest(workspace.root, entry.packageDir)] as const,
      ),
    ),
  )

  for (const entry of packages) {
    const dir = resolve(workspace.root, entry.packageDir)
    if (declaresScript(manifests.get(entry.packageName) ?? {}, 'build')) {
      const outcome = await runBuild(dir, entry.packageName, manager, stream)
      if (!outcome.ok) {
        stream.write('deploy', `${entry.packageName}: the build failed — ${outcome.message ?? 'no detail'}`)
      }
    } else {
      stream.write('deploy', `${entry.packageName}: declares no build script`)
    }
  }

  const reconcile: ReconcileContext = { workspace, settings, compose, stream, level, restart: { restart } }
  const queue = createReconcileQueue(reconcile)
  await queue.request()

  const watches: WatchProcess[] = []
  for (const entry of packages) {
    const dir = resolve(workspace.root, entry.packageDir)
    if (declaresScript(manifests.get(entry.packageName) ?? {}, 'watch')) {
      watches.push(startWatch(dir, entry.packageName, manager, stream))
    } else {
      stream.write('deploy', `${entry.packageName}: declares no watch script; built once and not watched`)
    }
  }

  const targets = selected.map((entry) => ({
    uuid: entry.uuid.toLowerCase(),
    outputDir: resolve(workspace.root, entry.outputDir),
  }))
  for (const target of targets) {
    await mkdir(target.outputDir, { recursive: true })
  }
  const watcher = watchBuiltOutput(targets, (changed) => {
    void queue.request(changed)
  })

  // a short replay, so an author attaching to a running server sees where it got to
  const follow = compose.followLogs(
    (line) => {
      stream.write('server', line)
    },
    { tail: 20 },
  )

  stream.write('deploy', 'watching for changes; Ctrl+C detaches and leaves the server running')

  try {
    await (context.deps?.waitForSignal ?? waitForSignal)()
  } finally {
    follow.stop()
    await watcher.stop()
    for (const watch of watches) {
      watch.stop()
    }
    stream.write('deploy', 'detached; the server is still running')
  }
}

/** The signals that detach the foreground loop and leave the server running. */
export const DETACHING_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

const exitNow = (): void => {
  process.exit(0)
}

/** Resolves on the first detaching signal; a second one during the shutdown exits immediately. */
export const waitForSignal = (): Promise<void> =>
  new Promise((settle) => {
    const onSignal = (): void => {
      for (const signal of DETACHING_SIGNALS) {
        process.off(signal, onSignal)
        process.once(signal, exitNow)
      }
      settle()
    }
    for (const signal of DETACHING_SIGNALS) {
      process.on(signal, onSignal)
    }
  })
