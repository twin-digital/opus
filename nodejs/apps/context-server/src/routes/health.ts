import type { FastifyInstance } from 'fastify'

export const healthRoutes = (fastify: FastifyInstance) => {
  fastify.get('/health', () => ({ status: 'ok' }))
  fastify.log.info('routes registered: /health')
}
