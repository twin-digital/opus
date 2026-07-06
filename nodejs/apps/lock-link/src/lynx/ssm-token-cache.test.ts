import { GetParameterCommand, ParameterNotFound, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSsmTokenCache } from './ssm-token-cache.js'

const ssm = mockClient(SSMClient)
const PARAM = '/lock-link/lynx-token'

describe('createSsmTokenCache', () => {
  beforeEach(() => {
    ssm.reset()
  })

  it('returns the cached token from SSM on first get and reuses in-memory after', async () => {
    ssm.on(GetParameterCommand, { Name: PARAM, WithDecryption: true }).resolves({ Parameter: { Value: 'jwt-42' } })
    const cache = createSsmTokenCache({ parameterName: PARAM })

    expect(await cache.get()).toBe('jwt-42')
    // Warm-container reuse: second call must not hit SSM again.
    expect(await cache.get()).toBe('jwt-42')
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1)
  })

  it('returns undefined on ParameterNotFound (first-ever run — cache miss)', async () => {
    ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ $metadata: {}, message: 'x' }))
    const cache = createSsmTokenCache({ parameterName: PARAM })

    expect(await cache.get()).toBeUndefined()
  })

  it('writes a SecureString with Overwrite: true and updates the in-memory cache', async () => {
    ssm.on(PutParameterCommand).resolves({})
    const cache = createSsmTokenCache({ parameterName: PARAM })

    await cache.set('jwt-new')

    const put = ssm.commandCalls(PutParameterCommand)
    expect(put).toHaveLength(1)
    expect(put[0].args[0].input).toMatchObject({
      Name: PARAM,
      Value: 'jwt-new',
      Type: 'SecureString',
      Overwrite: true,
    })
    // Post-set get() must NOT re-hit SSM — the closure cache holds the fresh value.
    expect(await cache.get()).toBe('jwt-new')
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(0)
  })

  it('rethrows non-NotFound SSM errors from get()', async () => {
    ssm.on(GetParameterCommand).rejects(Object.assign(new Error('AccessDenied'), { name: 'AccessDeniedException' }))
    const cache = createSsmTokenCache({ parameterName: PARAM })

    await expect(cache.get()).rejects.toThrow(/AccessDenied/)
  })
})
