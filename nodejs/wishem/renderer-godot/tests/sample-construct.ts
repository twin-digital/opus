import { fileURLToPath } from 'node:url'
import { startProductConstruct } from '@thrashplay/wishem-construct-manager/node'
import type { ProductConstruct } from '@thrashplay/wishem-construct-manager/node'
import type { Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { behaviors } from '@thrashplay/wishem-sample-product'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

export interface SampleConstructOptions {
  /** Default 0: the system selects a port. */
  port?: number
  /** Default `false`. */
  paused?: boolean
}

/** Starts the sample construct with a clock of 500 milliseconds. */
export const startSampleConstruct = async (options: SampleConstructOptions = {}): Promise<ProductConstruct> => {
  const { data, problems } = await readModelFolder(MODEL_FOLDER)
  if (data === undefined) {
    throw new Error(`cannot read the model folder of the sample product: ${problems.map((p) => p.message).join('; ')}`)
  }
  return startProductConstruct({
    id: 'sample',
    model: data as Model,
    behaviors,
    running: options.paused !== true,
    stepMs: 500,
    port: options.port ?? 0,
  })
}
