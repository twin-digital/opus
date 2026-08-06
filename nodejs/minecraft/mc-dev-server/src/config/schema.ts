/**
 * The `/mc-dev-kit/config@1` schema, vendored from the planning repository's schema pool
 * (`schemas/mc-dev-kit/config.1.yaml`). It is a bound external contract: this copy tracks that
 * file and is never edited on its own.
 */
export const configSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: '/mc-dev-kit/config@1',
  title: 'workspace config',
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { const: '1' },
    level: { $ref: '#/$defs/level' },
    seed: { $ref: '#/$defs/seed' },
    spawn: { $ref: '#/$defs/spawn' },
    image: { type: 'string' },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    eula: { type: 'boolean' },
    profiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          packs: { type: 'array', items: { type: 'string' } },
          level: { $ref: '#/$defs/level' },
          seed: { $ref: '#/$defs/seed' },
          spawn: { $ref: '#/$defs/spawn' },
        },
      },
    },
    defaultProfile: { type: 'string' },
  },
  $defs: {
    level: { type: 'string' },
    // the upper bound is not exactly representable as a JS number; the exact range is enforced
    // against the bigint the config parse keeps
    // eslint-disable-next-line no-loss-of-precision
    seed: { type: 'integer', minimum: -9223372036854775808, maximum: 9223372036854775807 },
    spawn: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer' } },
  },
} as const
