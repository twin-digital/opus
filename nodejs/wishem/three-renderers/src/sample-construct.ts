import { fileURLToPath } from 'node:url'
import { startProductConstruct } from '@thrashplay/wishem-construct-manager/node'
import type { Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import type { Hub } from '@thrashplay/wishem-hub'
import { behaviors } from '@thrashplay/wishem-sample-product'

/** The default port of the link of the sample construct. */
export const DEFAULT_HUB_PORT = 4750

/** The time of one tick of the sample construct, in milliseconds. */
export const SAMPLE_STEP_MS = 500

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

export interface SampleConstructOptions {
  /** Default 4750. Use 0 to let the system select a port. */
  port?: number
  /** Default `false`. */
  paused?: boolean
}

export interface SampleConstruct {
  /** For example `ws://127.0.0.1:4750/link`. */
  readonly linkUrl: string
  readonly hub: Hub
  /** Stops the clock and the hub and releases the port. Gives the same promise on each call. */
  close(): Promise<void>
}

/** Reads the model folder of the sample product and starts its product construct. Rejects with `EADDRINUSE` when the port is in use. */
export const startSampleConstruct = async (options: SampleConstructOptions = {}): Promise<SampleConstruct> => {
  const { port = DEFAULT_HUB_PORT, paused = false } = options
  const { data, problems } = await readModelFolder(MODEL_FOLDER)
  if (data === undefined) {
    throw new Error(`cannot read the model folder of the sample product: ${problems.map((p) => p.message).join('; ')}`)
  }

  const construct = await startProductConstruct({
    id: 'sample',
    model: data as Model,
    behaviors,
    running: !paused,
    stepMs: SAMPLE_STEP_MS,
    port,
  })
  return { linkUrl: construct.linkUrl, hub: construct.hub, close: () => construct.close() }
}
