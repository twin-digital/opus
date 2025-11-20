import type { FastifyInstance } from 'fastify'
import { getRequestSchema, getResponseSchema } from '../schemas/context-schemas.js'
import { search } from '../lib/kb.js'
import { MAX_CHUNKS } from '../config/index.js'

export const contextRoutes = (fastify: FastifyInstance) => {
  const requestSchema = getRequestSchema()
  const responseSchema = getResponseSchema()

  fastify.post(
    '/context/query',
    {
      schema: {
        body: requestSchema,
        response: { 200: responseSchema },
      },
    },
    async (request, _reply) => {
      const body = request.body as { kbId: string; query: string; chunks?: number }
      const kbId = body.kbId
      const query = body.query
      const chunks = body.chunks ?? MAX_CHUNKS

      const results = await search(kbId, query, chunks)

      return {
        status: 'ok',
        metadata: {
          kb: kbId,
          requested: { chunks },
          returned: results.length,
        },
        chunks: results,
      }
    },
  )

  fastify.log.info('routes registered: /context')
}
