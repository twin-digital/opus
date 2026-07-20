import { chmod, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

import { execa } from 'execa'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'

import { CONSOLE_TIMEOUT_MS, LOG_LEVEL, SERVICE_NAME, SOCKET_PATH } from '../config/index.js'
import { ConsoleBroker } from '../lib/console-broker.js'
import { createSnapshot } from '../lib/snapshot.js'

const CommandBody = z.object({
  /** Console command + args, e.g. ["list"] or ["querytarget", "Steve"]. */
  args: z.array(z.string()).min(1),
  /** Regex (source + flags) the reply must match. Omit for fire-and-forget. */
  reply: z.string().optional(),
  flags: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
})

const SnapshotBody = z.object({
  /** Absolute directory to stage the world tree under (<destDir>/worlds/<level>/…). */
  destDir: z.string().min(1),
})

export const buildServer = (broker: ConsoleBroker): FastifyInstance => {
  const app = Fastify({ logger: { level: LOG_LEVEL } })

  app.get('/health', async () => ({ ok: true }))

  app.get('/server/status', async () => {
    // `is-active` is a read-only query; exit 0 means active.
    const result = await execa('/bin/systemctl', ['is-active', '--quiet', SERVICE_NAME], {
      reject: false,
    })
    return { service: SERVICE_NAME, active: result.exitCode === 0 }
  })

  app.post('/console/command', async (request, reply) => {
    const parsed = CommandBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues })
    }
    const { args, reply: pattern, flags, timeoutMs } = parsed.data

    // Fire-and-forget when no reply pattern is given.
    if (!pattern) {
      await broker.runExclusive(() => broker.sendRaw(args))
      return { sent: true }
    }

    let regex: RegExp
    try {
      regex = new RegExp(pattern, flags)
    } catch (err) {
      return reply.code(400).send({ error: `invalid reply regex: ${(err as Error).message}` })
    }

    const match = await broker.command(args, regex, timeoutMs ?? CONSOLE_TIMEOUT_MS)
    if (!match) {
      return reply.code(504).send({ matched: false, error: 'no reply within timeout' })
    }
    return { matched: true, full: match[0], groups: match.slice(1) }
  })

  app.post('/snapshot', async (request, reply) => {
    const parsed = SnapshotBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues })
    }
    try {
      return await createSnapshot(broker, parsed.data.destDir)
    } catch (err) {
      request.log.error({ err }, 'snapshot failed')
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  return app
}

export const start = async (): Promise<void> => {
  const broker = new ConsoleBroker()
  const app = buildServer(broker)

  // Clear any hold a previously crashed/killed snapshot could have left behind
  // before we start serving — resuming when nothing is held is harmless.
  try {
    await broker.reapDanglingHold()
  } catch (err) {
    app.log.warn({ err }, 'startup save-resume (dangling-hold reap) failed; continuing')
  }

  await mkdir(dirname(SOCKET_PATH), { recursive: true })
  // Fastify/Node won't bind if the socket path already exists.
  await rm(SOCKET_PATH, { force: true })

  try {
    await app.listen({ path: SOCKET_PATH })
    // 0660 so root (create-backup) and the minecraft group (web UI, timer) can
    // connect; no other users.
    await chmod(SOCKET_PATH, 0o660)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = () => {
    app.close().finally(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

await start()
