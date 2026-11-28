import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { ClockTimer } from '@thrashplay/wishem-clock'
import type { Model } from '@thrashplay/wishem-core'
import { openLink } from '@thrashplay/wishem-hub'
import type { Hub, Port, RemoteLink } from '@thrashplay/wishem-hub'
import type { NativeBehavior } from '@thrashplay/wishem-update'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID } from './ids.js'
import { ipcChannel } from './ipc-channel.js'
import type { IpcEndpoint } from './ipc-channel.js'
import { startProductConstruct } from './product-construct.js'

export interface ProductConstructStart {
  /** The ID in the construct list. */
  id: string
  model: Model
  /** The first `running` value of the part `time`. */
  running: boolean
}

export interface LaunchedConstruct {
  readonly id: string
  /** For example `ws://127.0.0.1:41377/link`. */
  readonly linkUrl: string
  /** The process ID of the product construct process, or of this process for `inProcessLauncher`. */
  readonly pid: number
  /** The input port `construct-manager` on the hub of the product construct. */
  readonly input: Port
  /** The output port `construct-manager-reader` on the hub of the product construct. */
  readonly reader: Port
  /** Resolves with a message when the construct ended with no call of `close()`. Never rejects. */
  readonly ended: Promise<string>
  /** Closes the ports and ends the construct. Gives the same promise on each call. */
  close(): Promise<void>
}

export interface LaunchHooks {
  /** Each line of the standard output and the standard error of the construct. */
  onLine?: (line: string) => void
  /** Called one time when the process exists, before the link opens. */
  onProcess?: (pid: number) => void
}

export type ProductConstructLauncher = (start: ProductConstructStart, hooks?: LaunchHooks) => Promise<LaunchedConstruct>

export interface ChildProcessLauncherOptions {
  /** The file URL of the product code. Default: no behaviors. */
  productCode?: string
  /** Default 50. */
  stepMs?: number
  /** Default 2000. */
  stopMs?: number
}

export interface InProcessLauncherOptions {
  behaviors?: readonly NativeBehavior[]
  stepMs?: number
  timer?: ClockTimer
  now?: () => number
}

export interface InProcessConstruct extends LaunchedConstruct {
  readonly hub: Hub
}

const DEFAULT_STOP_MS = 2000

const PROCESS_FILE = fileURLToPath(new URL('../dist/product-construct-process.js', import.meta.url))

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const exitText = (code: number | null, signal: NodeJS.Signals | null): string =>
  signal === null ?
    `The process of the construct ended with the exit code ${code ?? 'unknown'}.`
  : `The process of the construct ended with the signal ${signal}.`

/** Waits for a control message of the child. Rejects with the message of `failed`, or when the child ends. */
const waitFor = (child: ChildProcess, ended: Promise<string>, type: string): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const onMessage = (message: unknown) => {
      const item = (typeof message === 'object' && message !== null ? message : {}) as Record<string, unknown>
      if (item.t === type) {
        cleanup()
        resolve(item)
      } else if (item.t === 'failed') {
        cleanup()
        reject(new Error(String(item.message)))
      }
    }
    const cleanup = () => {
      child.off('message', onMessage)
    }
    child.on('message', onMessage)
    void ended.then((text) => {
      cleanup()
      reject(new Error(text))
    })
  })

/** Starts each product construct in a product construct process. Rejects with the reason of a failed start, and then no process stays. */
export const childProcessLauncher =
  (options: ChildProcessLauncherOptions = {}): ProductConstructLauncher =>
  async (start, hooks = {}) => {
    const child = fork(PROCESS_FILE, [], {
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'json',
    })
    let closeCalled = false
    let finished = false
    const closed = new Promise<string>((resolve) => {
      child.once('close', (code, signal) => {
        finished = true
        resolve(exitText(code, signal))
      })
    })
    for (const stream of [child.stdout, child.stderr]) {
      if (stream) {
        createInterface({ input: stream }).on('line', (line) => {
          hooks.onLine?.(line)
        })
      }
    }

    // An error of the child process or of a send ends the construct.
    let reportError: (text: string) => void = () => undefined
    const errored = new Promise<string>((resolve) => {
      reportError = resolve
    })
    const stopped = Promise.race([closed, errored])
    const fail = (error: unknown) => {
      reportError(`The process of the construct had an error: ${messageOf(error)}`)
      try {
        child.kill('SIGKILL')
      } catch {
        // The process is gone.
      }
    }
    child.on('error', fail)
    const sendToChild = (message: object) => {
      child.send(message, (error) => {
        if (error) {
          fail(error)
        }
      })
    }

    const kill = async (): Promise<void> => {
      if (!finished) {
        child.kill('SIGKILL')
      }
      await closed
    }

    let link: RemoteLink | undefined
    let linkUrl: string
    try {
      if (child.pid === undefined) {
        throw new Error('The process of the construct did not start.')
      }
      hooks.onProcess?.(child.pid)
      const ready = waitFor(child, stopped, 'ready')
      sendToChild({
        t: 'start',
        id: start.id,
        model: start.model,
        running: start.running,
        ...(options.stepMs === undefined ? {} : { stepMs: options.stepMs }),
        ...(options.productCode === undefined ? {} : { productCode: options.productCode }),
      })
      await ready
      link = await openLink(ipcChannel(child as unknown as IpcEndpoint), [
        { id: CONSTRUCT_MANAGER_ID, kind: 'input' },
        { id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' },
      ])
      const serving = waitFor(child, stopped, 'serving')
      sendToChild({ t: 'serve' })
      linkUrl = String((await serving).linkUrl)
    } catch (error) {
      link?.close()
      await kill()
      throw new Error(messageOf(error), { cause: error })
    }

    const { pid } = child
    const input = link.ports[CONSTRUCT_MANAGER_ID]
    const reader = link.ports[CONSTRUCT_MANAGER_READER_ID]
    const stopMs = options.stopMs ?? DEFAULT_STOP_MS
    const openedLink = link
    let closing: Promise<void> | undefined

    return {
      id: start.id,
      linkUrl,
      pid,
      input,
      reader,
      ended: stopped.then((text) => (closeCalled ? new Promise<string>(() => undefined) : text)),
      close: () => {
        closing ??= (async () => {
          closeCalled = true
          input.close()
          reader.close()
          openedLink.close()
          if (finished) {
            return
          }
          try {
            child.send({ t: 'stop' }, () => undefined)
          } catch {
            // The IPC channel is closed. The process ends on the disconnect.
          }
          const timer = setTimeout(() => {
            child.kill('SIGKILL')
          }, stopMs)
          try {
            await closed
          } finally {
            clearTimeout(timer)
          }
        })()
        return closing
      },
    }
  }

/** Starts each product construct in this process with `startProductConstruct`. For tests. `ended` never resolves. */
export const inProcessLauncher =
  (options: InProcessLauncherOptions = {}): ProductConstructLauncher =>
  async (start, hooks = {}) => {
    hooks.onProcess?.(process.pid)
    const construct = await startProductConstruct({
      id: start.id,
      model: start.model,
      running: start.running,
      ...(options.behaviors === undefined ? {} : { behaviors: options.behaviors }),
      ...(options.stepMs === undefined ? {} : { stepMs: options.stepMs }),
      ...(options.timer === undefined ? {} : { timer: options.timer }),
      ...(options.now === undefined ? {} : { now: options.now }),
      onError: (error) => {
        hooks.onLine?.(messageOf(error))
      },
    })
    let input: Port
    let reader: Port
    try {
      input = construct.hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
      reader = construct.hub.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' })
    } catch (error) {
      await construct.close()
      throw error
    }
    let closing: Promise<void> | undefined
    const launched: InProcessConstruct = {
      id: start.id,
      linkUrl: construct.linkUrl,
      pid: process.pid,
      input,
      reader,
      hub: construct.hub,
      ended: new Promise<string>(() => undefined),
      close: () => {
        closing ??= (async () => {
          input.close()
          reader.close()
          await construct.close()
        })()
        return closing
      },
    }
    return launched
  }
