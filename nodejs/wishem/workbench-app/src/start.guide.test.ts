// @vitest-environment node
// Runs the steps of the test guide of the change 539 that need no web browser, with a child process.
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { constructInputs } from '@thrashplay/wishem-construct-manager'
import type { ConstructEntry, ConstructList } from '@thrashplay/wishem-construct-manager'
import { storeInputs } from '@thrashplay/wishem-core'
import { hubInputs, openLink, webSocketChannel, type HubEvent, type Port } from '@thrashplay/wishem-hub'
import { COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'

const script = join(import.meta.dirname, '..', 'scripts', 'start.ts')
const workbenchModel = join(import.meta.dirname, '..', '..', 'workbench', 'model')
const sampleModel = join(import.meta.dirname, '..', '..', 'sample-product', 'model')
const sampleViews = join(import.meta.dirname, '..', '..', 'sample-product', 'views', 'react')
const SAMPLE_CODE = '@thrashplay/wishem-sample-product'

interface Client {
  port: Port
  socket: WebSocket
  close: () => void
}

let clientCount = 0

const open = async (address: string): Promise<Client> => {
  const socket = new WebSocket(address)
  clientCount += 1
  const id = `guide-${String(clientCount)}`
  const link = await openLink(await webSocketChannel(socket), [{ id, kind: 'input' }])
  return {
    port: link.ports[id],
    socket,
    close: () => {
      link.close()
    },
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Time {
  ticks: number
  running: boolean
  stepMs?: number
}

const timeOf = (client: Client) => client.port.read().time as Time
const countOf = (client: Client) =>
  Number(new RegExp(`"${COUNT_FIELD}":(\\d+)`).exec(JSON.stringify(client.port.read().store))?.[1])

const entryOf = (client: Client): ConstructEntry | undefined =>
  (client.port.read().constructs as ConstructList).constructs.play

const until = async (check: () => boolean, describeState: () => string, ms = 15000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describeState()}`)
    }
    await wait(25)
  }
}

const upgradeStatus = (url: URL) =>
  new Promise<number>((resolve, reject) => {
    const request = httpRequest(url, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    })
    request.on('response', (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    request.on('upgrade', (response, socket) => {
      socket.destroy()
      resolve(response.statusCode ?? 0)
    })
    request.on('error', reject)
    request.end()
  })

describe('the test guide: run, pause, step, and step back through the page server', () => {
  let folder = ''
  let model = ''
  let product = ''
  let child: ChildProcess | undefined
  let text = ''
  let page = ''
  let wsBase = ''
  const clients: Client[] = []

  const connect = async (path: string) => {
    const client = await open(`${wsBase}${path}`)
    clients.push(client)
    return client
  }

  const send = (workbench: Client, input: object) => workbench.port.submit(constructInputs.send('play', input as never))

  const waitForCount = (client: Client, predicate: (count: number) => boolean) =>
    until(
      () => predicate(countOf(client)),
      () => `count ${String(countOf(client))}`,
    )

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'workbench-guide-'))
    model = join(folder, 'model')
    product = join(folder, 'product')
    const views = join(folder, 'views')
    cpSync(workbenchModel, model, { recursive: true })
    cpSync(sampleModel, product, { recursive: true })
    mkdirSync(views)
    child = spawn(
      'node',
      [
        script,
        '--model',
        model,
        '--views',
        views,
        '--no-view-types',
        '--product',
        product,
        '--product-code',
        SAMPLE_CODE,
        '--product-views',
        sampleViews,
        '--port',
        '0',
        '--hub-port',
        '0',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child.stdout?.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()))
    await until(
      () => text.includes('wishem: workbench at') || child?.exitCode !== null,
      () => text,
    )
    page = /wishem: workbench at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(text)?.[1] ?? ''
    wsBase = page.replace('http:', 'ws:')
  }, 30000)

  afterAll(async () => {
    clients.splice(0).forEach((client) => {
      client.close()
    })
    if (child?.exitCode === null && child.signalCode === null) {
      const closed = new Promise((resolve) => child?.once('close', resolve))
      child.kill('SIGKILL')
      await closed
    }
    rmSync(folder, { recursive: true, force: true })
  })

  it('does the steps 1, 3, 4, 5, 6, 7, 9, 10, and 11', { timeout: 40000 }, async () => {
    // Step 1: the lines of the start, and a 404 for a construct that does not run.
    const lines = text.split('\n')
    expect(lines.slice(0, 4)).toEqual([
      `wishem: model ${model}`,
      `wishem: product ${product}`,
      `wishem: product code ${SAMPLE_CODE}`,
      `wishem: product views ${sampleViews}`,
    ])
    expect(lines[4]).toMatch(/^wishem: link at ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(lines[5]).toBe(`wishem: workbench at ${page}`)
    const workbench = await connect('link')
    expect(Object.keys(workbench.port.read()).sort()).toEqual(['constructs', 'product', 'store'])
    expect(await upgradeStatus(new URL('constructs/play/link', page))).toBe(404)

    // Step 3: run, and a link client reads the construct through the page address.
    const applied: HubEvent[] = []
    workbench.port.subscribe((event) => applied.push(event))
    expect(await workbench.port.submit(constructInputs.start('play'))).toMatchObject({ ok: true })
    await until(
      () => /wishem: construct play runs, link at ws:\/\/127\.0\.0\.1:\d+\/link/.test(text),
      () => text,
    )
    const play = await connect('constructs/play/link')
    expect(Object.keys(play.port.read()).sort()).toEqual(['store', 'time'])
    await until(
      () => timeOf(play).ticks > 10 && countOf(play) > 10,
      () => JSON.stringify(timeOf(play)),
    )
    expect(applied).toContainEqual(
      expect.objectContaining({ type: 'applied', input: expect.objectContaining({ type: 'constructs/start' }) }),
    )

    // Step 4: pause, and the picture stays.
    await send(workbench, { type: 'time/set-running', payload: { running: false } })
    await until(
      () => !timeOf(play).running,
      () => JSON.stringify(timeOf(play)),
    )
    const paused = { ticks: timeOf(play).ticks, count: countOf(play) }
    await wait(500)
    expect({ ticks: timeOf(play).ticks, count: countOf(play) }).toEqual(paused)
    expect(timeOf(play).stepMs).toBe(50)

    // Step 5: step and step back.
    await send(workbench, { type: 'time/advance', payload: { ms: 50 } })
    await until(
      () => timeOf(play).ticks === paused.ticks + 1,
      () => JSON.stringify(timeOf(play)),
    )
    expect(countOf(play)).toBe(paused.count + 1)
    expect(await workbench.port.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))).toMatchObject({
      ok: true,
    })
    await until(
      () => timeOf(play).ticks === paused.ticks,
      () => JSON.stringify(timeOf(play)),
    )
    expect(countOf(play)).toBe(paused.count)
    expect(timeOf(play).running).toBe(false)

    // Step 6: a change of the authored state while paused, and a step back after it.
    const productInputs = storeInputs('product')
    await workbench.port.submit(
      productInputs.setField({ entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value: 100 }),
    )
    await waitForCount(play, (count) => count === 100)
    expect(timeOf(play).ticks).toBe(paused.ticks)
    await send(workbench, { type: 'time/advance', payload: { ms: 50 } })
    await waitForCount(play, (count) => count === 101)
    await workbench.port.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))
    await waitForCount(play, (count) => count === 100)
    expect(timeOf(play).running).toBe(false)
    const stateFile = join(product, 'state.json')
    const countPattern = new RegExp(`("${COUNT_FIELD}": *)100`)
    await until(
      () => countPattern.test(readFileSync(stateFile, 'utf8')),
      () => readFileSync(stateFile, 'utf8'),
    )

    // Step 7: a hand edit while the construct runs.
    await send(workbench, { type: 'time/set-running', payload: { running: true } })
    await until(
      () => timeOf(play).running,
      () => JSON.stringify(timeOf(play)),
    )
    writeFileSync(stateFile, readFileSync(stateFile, 'utf8').replace(countPattern, '$1500'))
    await waitForCount(play, (count) => count >= 500)
    expect(applied).toContainEqual(
      expect.objectContaining({
        type: 'applied',
        input: expect.objectContaining({ type: 'product/replace-model', source: 'product-files' }),
      }),
    )

    // Step 8: stop, and start again paused at the tick 0.
    play.close()
    expect(await workbench.port.submit(constructInputs.stop('play'))).toMatchObject({ ok: true })
    await until(
      () => text.includes('wishem: construct play stopped'),
      () => text,
    )
    await until(
      () => entryOf(workbench)?.status === 'stopped',
      () => JSON.stringify(entryOf(workbench)),
    )
    expect(await workbench.port.submit(constructInputs.start('play', { running: false }))).toMatchObject({ ok: true })
    await until(
      () => entryOf(workbench)?.status === 'running' && entryOf(workbench)?.link !== undefined,
      () => JSON.stringify(entryOf(workbench)),
    )
    const second = await connect('constructs/play/link')
    expect(timeOf(second)).toMatchObject({ ticks: 0, running: false })
    expect(countOf(second)).toBe(500)

    // Step 9: a step back with no tick, and a count that is not correct.
    const noTick = await workbench.port.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))
    expect(noTick).toMatchObject({ ok: true })
    await until(
      () => entryOf(workbench)?.lastSend?.seq === (noTick as { seq: number }).seq,
      () => JSON.stringify(entryOf(workbench)),
    )
    expect(entryOf(workbench)?.lastSend?.result).toMatchObject({
      ok: false,
      reason: 'invalid',
      problems: [{ message: 'The construct has no tick to step back.' }],
    })
    const badCount = await workbench.port.submit(constructInputs.rewind({ construct: 'play', ticks: 0 }))
    expect(badCount).toMatchObject({ ok: false, reason: 'invalid', problems: [{ path: ['payload', 'ticks'] }] })

    // Step 10: a rewind of the workbench past a step back sends nothing to the construct.
    await send(workbench, { type: 'time/advance', payload: { ms: 50 } })
    await until(
      () => timeOf(second).ticks === 1,
      () => JSON.stringify(timeOf(second)),
    )
    const back = await workbench.port.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))
    expect(back).toMatchObject({ ok: true })
    await until(
      () => timeOf(second).ticks === 0,
      () => JSON.stringify(timeOf(second)),
    )
    const seen: HubEvent[] = []
    second.port.subscribe((event) => seen.push(event))
    expect(await workbench.port.submit(hubInputs.rewind((back as { seq: number }).seq - 1))).toMatchObject({ ok: true })
    await wait(400)
    const check = await connect('constructs/play/link')
    expect(timeOf(check).ticks).toBe(0)
    expect(seen.filter((event) => event.type === 'applied')).toEqual([])

    // Step 11: stop, and the link of the stage ends.
    const events: string[] = []
    second.port.subscribe((event) => events.push(event.type))
    const closed = new Promise<void>((resolve) => {
      second.socket.addEventListener('close', () => {
        resolve()
      })
    })
    expect(await workbench.port.submit(constructInputs.stop('play'))).toMatchObject({ ok: true })
    await closed
    expect(events).toContain('stopping')
    await until(
      () => text.split('wishem: construct play stopped').length > 2,
      () => text,
    )
    expect(await upgradeStatus(new URL('constructs/play/link', page))).toBe(404)
  })

  it('does the step 13: the option errors', { timeout: 60000 }, async () => {
    const run = (args: string[]) =>
      new Promise<{ code: number | null; output: string }>((resolve) => {
        const runChild = spawn(
          'node',
          [script, '--model', model, '--no-view-types', '--port', '0', '--hub-port', '0', ...args],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        let output = ''
        runChild.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
        runChild.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
        runChild.once('close', (code) => {
          resolve({ code, output })
        })
      })

    const missing = join(folder, 'missing')
    const first = await run(['--product', product, '--product-views', missing])
    expect(first.code).toBe(1)
    expect(first.output).toContain(`wishem: the product views folder ${missing} does not exist`)

    const second = await run(['--product-views', sampleViews])
    expect(second.code).toBe(1)
    expect(second.output).toContain('wishem: --product-views needs --product')
  })
})
