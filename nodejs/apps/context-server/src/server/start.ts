import Fastify, { type FastifyInstance } from 'fastify'
import config from '../config/index.js'
import { contextRoutes } from '../routes/context.js'
import { healthRoutes } from '../routes/health.js'
import { jwtAuthPlugin } from '../plugins/auth.js'

const authenticatedRoutes = (fastify: FastifyInstance) => {
  fastify.register(jwtAuthPlugin)
  fastify.register(contextRoutes)
}

export const buildServer = async () => {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } })

  // register routes
  await app.register(healthRoutes)
  await app.register(authenticatedRoutes)

  return app
}

export const start = async () => {
  const app = await buildServer()
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

await start()
