/**
 * The entry of a product construct process. The launcher `childProcessLauncher` forks this file.
 * The messages on the IPC channel are in `launchers.ts`.
 */
import { serveHub } from '@thrashplay/wishem-host-nodejs'
import type { HubServer } from '@thrashplay/wishem-host-nodejs'
import { serveLink } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import type { Model } from '@thrashplay/wishem-core'
import { checkBehaviors } from '@thrashplay/wishem-update'
import type { NativeBehavior } from '@thrashplay/wishem-update'
import { ipcChannel } from './ipc-channel.js'
import type { IpcEndpoint } from './ipc-channel.js'
import { createProductHub, startProductClock } from './product-construct.js'

interface StartMessage {
  t: 'start'
  id: string
  model: Model
  running: boolean
  stepMs?: number
  productCode?: string
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const send = (message: object): Promise<void> =>
  new Promise((resolve) => {
    if (process.send === undefined || !process.connected) {
      resolve()
      return
    }
    process.send(message, () => {
      resolve()
    })
  })

let hub: Hub | undefined
let server: HubServer | undefined
let clock: { stop(): void } | undefined
let stepMs: number | undefined
let ending = false

const end = async (code: number): Promise<void> => {
  if (ending) {
    return
  }
  ending = true
  try {
    clock?.stop()
    if (server === undefined) {
      hub?.stop()
    } else {
      await server.close()
    }
  } catch {
    // The process ends in any case.
  }
  process.exit(code)
}

const fail = async (error: unknown): Promise<void> => {
  await send({ t: 'failed', message: messageOf(error) })
  await end(1)
}

const loadBehaviors = async (productCode: string | undefined): Promise<readonly NativeBehavior[]> => {
  if (productCode === undefined) {
    return []
  }
  const loaded = (await import(productCode)) as { behaviors?: unknown }
  return checkBehaviors(loaded.behaviors)
}

const onStart = async (message: StartMessage): Promise<void> => {
  try {
    const behaviors = await loadBehaviors(message.productCode)
    stepMs = message.stepMs
    hub = createProductHub({
      model: message.model,
      behaviors,
      running: message.running,
      ...(stepMs === undefined ? {} : { stepMs }),
      onError: (error) => {
        console.error(messageOf(error))
      },
    })
    hub.start()
    serveLink(hub, ipcChannel(process as unknown as IpcEndpoint))
    await send({ t: 'ready' })
  } catch (error) {
    await fail(error)
  }
}

const onServe = async (): Promise<void> => {
  try {
    if (hub === undefined) {
      throw new Error('The construct has not started.')
    }
    server = await serveHub(hub, { port: 0 })
    clock = startProductClock(hub, stepMs === undefined ? {} : { stepMs })
    await send({ t: 'serving', linkUrl: server.linkUrl })
  } catch (error) {
    await fail(error)
  }
}

if (process.send === undefined) {
  console.error('This file runs as a child process with an IPC channel.')
  process.exit(1)
}

process.on('disconnect', () => {
  void end(0)
})

process.on('message', (message: unknown) => {
  const { t } = (typeof message === 'object' && message !== null ? message : {}) as { t?: unknown }
  if (t === 'start') {
    void onStart(message as StartMessage)
  } else if (t === 'serve') {
    void onServe()
  } else if (t === 'stop') {
    void end(0)
  }
})
