import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import set from 'lodash-es/set.js'
import { JWT_SECRET } from '../config/index.js'
import fastifyPlugin from 'fastify-plugin'

export const jwtAuthPlugin = fastifyPlugin((fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const auth = request.headers.authorization ?? ''

    if (!auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing authorization header' })
    }

    const token = auth.slice(7)

    try {
      const payload = jwt.verify(token, JWT_SECRET)
      set(request, 'user', payload)
    } catch (err) {
      fastify.log.warn({ err }, 'JWT verification failed')
      return reply.code(401).send({ error: 'missing or invalid authorization token' })
    }
  })

  fastify.log.info('JWT Auth plugin registered')
})
