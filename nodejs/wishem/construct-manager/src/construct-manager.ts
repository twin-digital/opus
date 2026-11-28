import type { ClockTimer, TimePart } from '@thrashplay/wishem-clock'
import type { Model } from '@thrashplay/wishem-core'
import { PRODUCT_ID } from '@thrashplay/wishem-host-nodejs'
import type { Hub, Input, JoinedState, Port, RecordedInput, SubmitResult } from '@thrashplay/wishem-hub'
import { constructInputs } from './construct-list.js'
import type { ConstructEntry, ConstructList, PassResult, ReportPayload, TimeState } from './construct-list.js'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID, CONSTRUCTS_ID } from './ids.js'
import { productChanges } from './product-changes.js'
import { startProductConstruct } from './product-construct.js'
import type { ProductConstruct, WrapStore } from './product-construct.js'

export interface ConstructManagerOptions {
  /** The workbench hub. It runs, and it has the parts `product` and `constructs`. */
  hub: Hub
  wrapStore?: WrapStore
  /** Default: write to the terminal. */
  log?: (line: string) => void
  /** For tests: given to each product construct. */
  stepMs?: number
  timer?: ClockTimer
  now?: () => number
}

export interface ConstructManager {
  /** The product constructs that run, by ID. */
  readonly running: ReadonlyMap<string, ProductConstruct>
  /** Stops each product construct and closes the two ports. Gives the same promise on each call. */
  close(): Promise<void>
}

interface Live {
  readonly construct: ProductConstruct
  readonly input: Port
  readonly reader: Port
  /** The product model that the construct manager last gave to the construct. */
  given: Model
}

const SEND = `${CONSTRUCTS_ID}/send`

const logToTerminal = (line: string): void => {
  console.log(line)
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const listOf = (state: JoinedState): Readonly<Record<string, ConstructEntry>> =>
  (state[CONSTRUCTS_ID] as ConstructList).constructs

const timeStateOf = (construct: ProductConstruct): TimeState =>
  (construct.hub.read().time as TimePart).running ? 'running' : 'paused'

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
  const running = new Map<string, ProductConstruct>()
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

  const stopConstruct = async (id: string, item: Live): Promise<void> => {
    live.delete(id)
    running.delete(id)
    item.input.close()
    item.reader.close()
    try {
      await item.construct.close()
    } catch (error) {
      log(`wishem: construct ${id}: ${messageOf(error)}`)
    }
    log(`wishem: construct ${id} stopped`)
  }

  const startConstruct = async (id: string, entry: ConstructEntry, product: Model): Promise<void> => {
    let construct: ProductConstruct | undefined
    let item: Live
    try {
      construct = await startProductConstruct({
        id,
        model: product,
        running: entry.startTime === 'running',
        ...(options.wrapStore === undefined ? {} : { wrapStore: options.wrapStore }),
        ...(options.stepMs === undefined ? {} : { stepMs: options.stepMs }),
        ...(options.timer === undefined ? {} : { timer: options.timer }),
        ...(options.now === undefined ? {} : { now: options.now }),
        onError: (error) => {
          log(`wishem: construct ${id}: ${messageOf(error)}`)
        },
      })
      item = {
        construct,
        input: construct.hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' }),
        reader: construct.hub.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' }),
        given: product,
      }
    } catch (error) {
      await construct?.close().catch(() => undefined)
      const message = messageOf(error)
      log(`wishem: construct ${id} failed: ${message}`)
      await report({ construct: id, status: 'failed', message })
      return
    }
    item.reader.subscribe((event) => {
      if (event.type === 'applied' && (event.input.type === 'time/set-running' || event.input.type === 'hub/rewind')) {
        enqueue(undefined)
      }
    })
    live.set(id, item)
    running.set(id, construct)
    log(`wishem: construct ${id} runs, link at ${construct.linkUrl}`)
    await report(liveReport(id, item))
  }

  const reconcile = async (): Promise<void> => {
    const state = reader.read()
    const list = listOf(state)
    for (const [id, item] of [...live]) {
      if (!Object.hasOwn(list, id) || list[id].want !== 'running') {
        await stopConstruct(id, item)
      }
    }
    for (const [id, entry] of Object.entries(list)) {
      if (closed || entry.want !== 'running' || live.has(id) || entry.status === 'failed') {
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
