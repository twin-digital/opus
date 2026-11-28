import type { TimePart } from '@thrashplay/wishem-clock'
import type { Model } from '@thrashplay/wishem-core'
import { PRODUCT_ID } from '@thrashplay/wishem-host-nodejs'
import { hubInputs } from '@thrashplay/wishem-hub'
import type { Hub, Input, JoinedState, Port, RecordedInput, SubmitResult } from '@thrashplay/wishem-hub'
import { constructInputs } from './construct-list.js'
import type {
  ConstructEntry,
  ConstructList,
  PassResult,
  ReportPayload,
  RewindPayload,
  TimeState,
} from './construct-list.js'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID, CONSTRUCTS_ID } from './ids.js'
import { childProcessLauncher } from './launchers.js'
import type { LaunchedConstruct, ProductConstructLauncher } from './launchers.js'
import { productChanges } from './product-changes.js'

export interface ConstructManagerOptions {
  /** The workbench hub. It runs, and it has the parts `product` and `constructs`. */
  hub: Hub
  /** Starts each product construct. Default: `childProcessLauncher()`. */
  launch?: ProductConstructLauncher
  /** Default: write to the terminal. */
  log?: (line: string) => void
}

export interface ConstructManager {
  /** The product constructs that run, by ID. */
  readonly running: ReadonlyMap<string, LaunchedConstruct>
  /** Stops each product construct and closes the two ports. Gives the same promise on each call. */
  close(): Promise<void>
}

interface Live {
  readonly construct: LaunchedConstruct
  readonly input: Port
  readonly reader: Port
  /** The `startSeq` of the entry when the construct started. */
  readonly startSeq: number
  /** The product model that the construct manager last gave to the construct. */
  given: Model
  /** One item for each applied `time/advance`: its sequence number and the product model given at that time. */
  readonly ticks: TickItem[]
}

interface TickItem {
  readonly seq: number
  readonly given: Model
}

const SEND = `${CONSTRUCTS_ID}/send`
const REWIND = `${CONSTRUCTS_ID}/rewind`

/** The record limit of the hub. */
const MAX_TICKS = 100000

const logToTerminal = (line: string): void => {
  console.log(line)
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const listOf = (state: JoinedState): Readonly<Record<string, ConstructEntry>> =>
  (state[CONSTRUCTS_ID] as ConstructList).constructs

const timeStateOf = (construct: LaunchedConstruct): TimeState =>
  (construct.reader.read().time as TimePart).running ? 'running' : 'paused'

const problemsOf = (result: Extract<SubmitResult, { ok: false }>): string =>
  result.problems.length === 0 ? result.reason : result.problems.map((problem) => problem.message).join('; ')

/** Attaches `construct-manager` and `construct-manager-reader` to the hub. Throws when an ID is in use. */
export const attachConstructManager = (options: ConstructManagerOptions): ConstructManager => {
  const { hub } = options
  const log = options.log ?? logToTerminal
  const input = hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
  let reader: Port
  try {
    reader = hub.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' })
  } catch (error) {
    input.close()
    throw error
  }

  const live = new Map<string, Live>()
  const running = new Map<string, LaunchedConstruct>()
  const failing = new Set<string>()
  const launch = options.launch ?? childProcessLauncher()
  let seenProduct = reader.read()[PRODUCT_ID]
  let chain: Promise<void> = Promise.resolve()
  let closed = false
  let closing: Promise<void> | undefined

  const report = async (payload: ReportPayload): Promise<void> => {
    if (closed) {
      return
    }
    await input.submit(constructInputs.report(payload))
  }

  const liveReport = (id: string, item: Live): ReportPayload => ({
    construct: id,
    status: 'running',
    link: item.construct.linkUrl,
    time: timeStateOf(item.construct),
  })

  const submitChanges = async (id: string, item: Live, product: Model): Promise<void> => {
    const inputs = productChanges(item.given, product)
    item.given = product
    for (const change of inputs) {
      const result = await item.input.submit(change).catch((error: unknown) => messageOf(error))
      if (typeof result === 'string' || !result.ok) {
        const message = typeof result === 'string' ? result : problemsOf(result)
        log(`wishem: construct ${id}: the change of the product was refused: ${message}`)
        await report({ ...liveReport(id, item), message })
      }
    }
  }

  const pass = async (recorded: RecordedInput): Promise<void> => {
    const payload = recorded.payload as { construct: string; input: Input }
    const item = live.get(payload.construct)
    if (!item) {
      return
    }
    const result: PassResult = await item.input
      .submit(payload.input)
      .catch((error: unknown): PassResult => ({ ok: false, reason: 'error', message: messageOf(error) }))
    await report({ ...liveReport(payload.construct, item), lastSend: { seq: recorded.seq, result } })
  }

  const stepBack = async (recorded: RecordedInput): Promise<void> => {
    const payload = recorded.payload as RewindPayload
    const item = live.get(payload.construct)
    if (!item) {
      return
    }
    const first = item.ticks.length === 0 ? undefined : item.ticks[Math.max(0, item.ticks.length - payload.ticks)]
    if (!first) {
      const result: PassResult = {
        ok: false,
        reason: 'invalid',
        problems: [{ message: 'The construct has no tick to step back.', path: ['payload', 'ticks'] }],
      }
      await report({ ...liveReport(payload.construct, item), lastSend: { seq: recorded.seq, result } })
      return
    }
    const inputs: Input[] = [
      hubInputs.rewind(first.seq - 1),
      ...productChanges(first.given, item.given),
      ...(timeStateOf(item.construct) === 'paused' ? [{ type: 'time/set-running', payload: { running: false } }] : []),
    ]
    // No await between the calls: the hub queues them in order, and no tick comes between them.
    const pending = inputs.map((next) => item.input.submit(next).catch((error: unknown) => messageOf(error)))
    const [rewound, ...rest] = await Promise.all(pending)
    for (const result of rest) {
      if (typeof result === 'string' || !result.ok) {
        log(
          `wishem: construct ${payload.construct}: a change after the step back was refused: ${typeof result === 'string' ? result : problemsOf(result)}`,
        )
      }
    }
    const result: PassResult = typeof rewound === 'string' ? { ok: false, reason: 'error', message: rewound } : rewound
    await report({ ...liveReport(payload.construct, item), lastSend: { seq: recorded.seq, result } })
  }

  const stopConstruct = async (id: string, item: Live): Promise<void> => {
    live.delete(id)
    running.delete(id)
    try {
      await item.construct.close()
    } catch (error) {
      log(`wishem: construct ${id}: ${messageOf(error)}`)
    }
    log(`wishem: construct ${id} stopped`)
  }

  const ended = async (id: string, item: Live, message: string): Promise<void> => {
    if (live.get(id) !== item || closed) {
      return
    }
    failing.add(id)
    live.delete(id)
    running.delete(id)
    try {
      await item.construct.close().catch(() => undefined)
      log(`wishem: construct ${id} failed: ${message}`)
      await report({ construct: id, status: 'failed', message, startSeq: item.startSeq }).catch((error: unknown) => {
        log(`wishem: construct manager: ${messageOf(error)}`)
      })
    } finally {
      failing.delete(id)
    }
  }

  const startConstruct = async (id: string, entry: ConstructEntry, product: Model): Promise<void> => {
    let construct: LaunchedConstruct
    try {
      construct = await launch(
        { id, model: product, running: entry.startTime === 'running' },
        {
          onProcess: (pid) => {
            log(`wishem: construct ${id} runs in the process ${pid}`)
          },
          onLine: (line) => {
            log(`wishem: construct ${id}: ${line}`)
          },
        },
      )
    } catch (error) {
      const message = messageOf(error)
      log(`wishem: construct ${id} failed: ${message}`)
      await report({ construct: id, status: 'failed', message, startSeq: entry.startSeq })
      return
    }
    const item: Live = {
      construct,
      input: construct.input,
      reader: construct.reader,
      startSeq: entry.startSeq,
      given: product,
      ticks: [],
    }
    item.reader.subscribe((event) => {
      if (event.type !== 'applied') {
        return
      }
      if (event.input.type === 'time/advance') {
        item.ticks.push({ seq: event.input.seq, given: item.given })
        if (item.ticks.length > MAX_TICKS) {
          item.ticks.shift()
        }
      } else if (event.input.type === 'hub/rewind') {
        const { seq } = event.input.payload as { seq: number }
        item.ticks.splice(0, item.ticks.length, ...item.ticks.filter((tick) => tick.seq <= seq))
      }
      if (event.input.type === 'time/set-running' || event.input.type === 'hub/rewind') {
        enqueue(undefined)
      }
    })
    live.set(id, item)
    running.set(id, construct)
    void construct.ended.then((message) => {
      enqueueEnd(id, item, message)
    })
    log(`wishem: construct ${id} runs, link at ${construct.linkUrl}`)
    await report(liveReport(id, item))
  }

  const reconcile = async (): Promise<void> => {
    const state = reader.read()
    const list = listOf(state)
    for (const [id, item] of [...live]) {
      if (!Object.hasOwn(list, id) || list[id].want !== 'running' || list[id].startSeq !== item.startSeq) {
        await stopConstruct(id, item)
      }
    }
    for (const [id, entry] of Object.entries(list)) {
      if (closed || entry.want !== 'running' || live.has(id) || failing.has(id) || entry.status === 'failed') {
        continue
      }
      await startConstruct(id, entry, reader.read()[PRODUCT_ID] as Model)
    }
  }

  const reportTruth = async (): Promise<void> => {
    for (const [id, entry] of Object.entries(listOf(reader.read()))) {
      const item = live.get(id)
      if (item) {
        const next = liveReport(id, item)
        if (entry.status !== 'running' || entry.link !== next.link || entry.time !== next.time) {
          await report(next)
        }
      } else if (entry.want !== 'running' && (entry.status === 'pending' || entry.status === 'running')) {
        // A wanted entry that is not live waits for its start event.
        await report({ construct: id, status: 'stopped' })
      }
    }
  }

  const handle = async (recorded: RecordedInput | undefined): Promise<void> => {
    if (closed) {
      return
    }
    const product = reader.read()[PRODUCT_ID] as Model
    if (product !== seenProduct) {
      seenProduct = product
      for (const [id, item] of [...live]) {
        await submitChanges(id, item, product)
      }
    }
    if (recorded?.type === SEND) {
      await pass(recorded)
    }
    if (recorded?.type === REWIND) {
      await stepBack(recorded)
    }
    await reconcile()
    await reportTruth()
  }

  function enqueue(recorded: RecordedInput | undefined): void {
    chain = chain
      .then(() => handle(recorded))
      .catch((error: unknown) => {
        log(`wishem: construct manager: ${messageOf(error)}`)
      })
  }

  function enqueueEnd(id: string, item: Live, message: string): void {
    chain = chain
      .then(() => ended(id, item, message))
      .catch((error: unknown) => {
        log(`wishem: construct manager: ${messageOf(error)}`)
      })
  }

  const unsubscribe = reader.subscribe((event) => {
    if (event.type === 'applied') {
      enqueue(event.input)
    }
  })
  enqueue(undefined)

  return {
    running,
    close: () => {
      closing ??= (async () => {
        closed = true
        unsubscribe()
        await chain
        await Promise.all([...live].map(([id, item]) => stopConstruct(id, item)))
        input.close()
        reader.close()
      })()
      return closing
    },
  }
}
