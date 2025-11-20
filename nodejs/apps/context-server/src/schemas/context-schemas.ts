import { MAX_CHUNKS, MAX_QUERY_LENGTH } from '../config/index.js'

export const getRequestSchema = () => ({
  type: 'object',
  required: ['kbId', 'query'],
  properties: {
    kbId: { type: 'string', minLength: 1 },
    query: { type: 'string', minLength: 1, maxLength: MAX_QUERY_LENGTH },
    chunks: { type: 'integer', minimum: 1, maximum: MAX_CHUNKS },
  },
  additionalProperties: false,
})

export const getChunkSchema = () => ({
  type: 'object',
  properties: {
    text: { type: 'string' },
    metadata: { type: 'object' },
  },
  required: ['text', 'metadata'],
  additionalProperties: false,
})

export const getResponseSchema = () => ({
  type: 'object',
  properties: {
    status: { type: 'string' },
    metadata: {
      type: 'object',
      properties: {
        kb: { type: 'string' },
        requested: { type: 'object', properties: { chunks: { type: 'integer' } } },
        returned: { type: 'integer' },
      },
      required: ['kb', 'requested', 'returned'],
    },
    chunks: { type: 'array', items: getChunkSchema() },
  },
  required: ['status', 'metadata', 'chunks'],
})
