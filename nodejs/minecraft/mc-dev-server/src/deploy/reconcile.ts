import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { discoverPacks } from '@twin-digital/mc-dev-kit'

import { reload } from '../server/console.js'
import { activationFile, packDir, poolDir, worldDir } from '../server/layout.js'
import { readObservedServer } from '../server/state.js'
import { selectPacks, SelectionError } from '../settings/resolve.js'
import { readBuiltOutput } from './built-output.js'
import { planReconcile } from './plan.js'
import { stubPayload } from './stub-pack.js'

import type { ComposeClient } from '../docker/compose.js'
import type { RunSettings } from '../settings/resolve.js'
import type { OutputStream } from '../stream.js'
import type { Workspace } from '../workspace.js'
import type { DesiredPack, ReconcilePlan } from './plan.js'
import type { PackEntry, PackKind, ValidPackEntry } from '@twin-digital/mc-dev-kit'

/** What one run of the reconcile did, for the stream and for tests. */
export interface ReconcileOutcome {
  plan: ReconcilePlan
  /** problems carried rather than thrown: a build that failed, a pack deployed as a stub */
  reported: readonly string[]
}

/** What a restart takes: the console stop, then bringing the container back and waiting for it. */
export interface RestartHooks {
  /** takes the server down through its console and brings it back, resolving when it is ready */
  restart(): Promise<void>
}

/** Everything a reconcile needs. */
export interface ReconcileContext {
  workspace: Workspace
  settings: RunSettings
  compose: ComposeClient
  stream: OutputStream
  /** the world the run serves */
  level: string
  /** how a restart is performed; a context without one reports the restart and does not perform it */
  restart?: RestartHooks
}

const KINDS: readonly PackKind[] = ['behavior', 'resource']

/** The invalid packs a selection carries; a run hosts what was asked for or it does not run. */
export const invalidSelected = (selected: readonly PackEntry[]): readonly PackEntry[] =>
  selected.filter((entry) => entry.status === 'invalid')

/** The message a selection carrying an invalid pack fails with. */
export const invalidSelectionMessage = (invalid: readonly PackEntry[]): string =>
  `the selection holds ${String(invalid.length)} pack(s) the kit reports invalid: ${invalid
    .map((entry) => `${entry.packageName} (${entry.problems.map((problem) => problem.code).join(', ')})`)
    .join('; ')}`

/** Writes a stub payload into a staging directory and reports the files it holds. */
const stageStub = async (dir: string, payload: Record<string, string>): Promise<readonly string[]> => {
  for (const [relative, content] of Object.entries(payload)) {
    const path = join(dir, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
  }
  return Object.keys(payload).sort()
}

/**
 * The one operation that changes what the server holds. It runs at start once the one-shot builds
 * have finished, and again on every debounced change to a selected pack's built output.
 *
 * Five steps, in order: re-run discovery and resolve the selection; read the server's pool
 * contents, activation lists, and each pool directory's file names; compare them against the built
 * output of the selected packs; apply the difference; bring the change live. A run with nothing to
 * apply applies nothing and brings nothing live.
 */
export const reconcileOnce = async (
  context: ReconcileContext,
  changed?: ReadonlySet<string>,
): Promise<ReconcileOutcome> => {
  const { compose, level, settings, stream, workspace } = context
  const reported: string[] = []

  // 1 — discovery runs at the head of every reconcile, so a raised version reaches this deploy
  const discovered = await discoverPacks({ workspace: workspace.root })
  const selected = selectPacks(discovered, settings.packs)
  const invalid = invalidSelected(selected)
  if (invalid.length > 0) {
    throw new SelectionError(invalidSelectionMessage(invalid))
  }

  const staging = await mkdtemp(join(tmpdir(), 'mc-dev-server-stage-'))
  try {
    const desired: DesiredPack[] = []
    for (const entry of selected as readonly ValidPackEntry[]) {
      const built = await readBuiltOutput(workspace.root, entry)
      if (built.files.includes('manifest.json')) {
        desired.push(built)
        continue
      }
      const dir = join(staging, `${entry.kind}-${built.uuid}`)
      const files = await stageStub(dir, stubPayload(entry))
      reported.push(`${entry.packageName}: nothing built at ${entry.outputDir}; deployed as a stub`)
      desired.push({ ...built, files, sourceDir: dir })
    }

    // 2 — read the pool contents and activation lists off the running container
    const observed = await readObservedServer(compose, level)

    // 3 — compare
    const plan = planReconcile({ desired, observed, ...(changed === undefined ? {} : { changed }) })

    // 4 — apply
    for (const removal of plan.remove) {
      stream.write('deploy', `removing ${removal.kind} pack ${removal.uuid} from the pool`)
      await compose.exec(['rm', '-rf', packDir(removal.kind, removal.uuid)])
    }
    for (const pack of plan.copy) {
      stream.write('deploy', `deploying ${pack.packageName} (${pack.kind} ${pack.uuid})`)
      const destination = packDir(pack.kind, pack.uuid)
      await compose.exec(['rm', '-rf', destination])
      await compose.exec(['mkdir', '-p', poolDir(pack.kind)])
      await compose.copyIn(pack.sourceDir, destination)
    }
    if (plan.writeActivation) {
      await compose.exec(['mkdir', '-p', worldDir(level)])
      for (const kind of KINDS) {
        const local = join(staging, `${kind}-activation.json`)
        await writeFile(local, `${JSON.stringify(plan.activation[kind], undefined, 2)}\n`, 'utf8')
        await compose.copyIn(local, activationFile(level, kind))
      }
      stream.write('deploy', `wrote the world's activation lists for '${level}'`)
    }

    // 5 — bring the change live
    if (plan.apply === 'reload') {
      stream.write('deploy', 'reloading the world')
      await reload(compose)
    } else if (plan.apply === 'restart') {
      for (const reason of plan.restartReasons) {
        stream.write('deploy', `restarting: ${reason}`)
      }
      if (context.restart === undefined) {
        reported.push('a restart was called for and this run performs none')
      } else {
        await context.restart.restart()
      }
    }

    for (const line of reported) {
      stream.write('deploy', line)
    }
    return { plan, reported }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Serialises reconciles. One runs at a time; changes arriving while one is in flight — the restart
 * it may be performing included — accumulate into a single follow-up that begins when the current
 * one returns. A reconcile is never cancelled part-way and never runs beside another.
 */
export interface ReconcileQueue {
  /** requests a reconcile covering the named packs; resolves when one covering them has run */
  request(changed?: Iterable<string>): Promise<void>
  /** waits for the in-flight and queued reconciles to drain */
  drain(): Promise<void>
}

export const createReconcileQueue = (context: ReconcileContext): ReconcileQueue => {
  let running = false
  let pending: Set<string> | undefined
  let waiters: (() => void)[] = []
  let idle: Promise<void> = Promise.resolve()

  const pump = async (): Promise<void> => {
    running = true
    try {
      while (pending !== undefined) {
        const changed = pending
        const settle = waiters
        pending = undefined
        waiters = []
        try {
          await reconcileOnce(context, changed)
        } catch (error) {
          // a reconcile that threw changed nothing on the server; the next save retries it
          context.stream.write('deploy', `the deploy failed and changed nothing: ${(error as Error).message}`)
        }
        for (const resolve of settle) {
          resolve()
        }
      }
    } finally {
      running = false
    }
  }

  return {
    request: (changed) => {
      pending ??= new Set<string>()
      for (const uuid of changed ?? []) {
        pending.add(uuid.toLowerCase())
      }
      const done = new Promise<void>((resolve) => {
        waiters.push(resolve)
      })
      if (!running) {
        idle = pump()
      }
      return done
    },
    drain: async () => {
      await idle
    },
  }
}
