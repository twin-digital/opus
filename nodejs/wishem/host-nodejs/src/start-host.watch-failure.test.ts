import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startHost } from './start-host.js'

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  watch: () => {
    throw new Error('no more watchers')
  },
}))

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

describe('startHost when the watch fails', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-host-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(
      path.join(folder, 'definitions', `${CT}.json`),
      JSON.stringify({ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }),
    )
    await writeFile(
      path.join(folder, 'state.json'),
      JSON.stringify({ entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }] }),
    )
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('rejects and frees the port', async () => {
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const address = probe.address()
    const port = typeof address === 'object' && address ? address.port : 0
    await new Promise((resolve) => probe.close(resolve))

    await expect(startHost({ folder, port, log: () => undefined })).rejects.toThrow('no more watchers')

    const again = createServer()
    await new Promise<void>((resolve, reject) => {
      again.once('error', reject)
      again.listen(port, '127.0.0.1', resolve)
    })
    await new Promise((resolve) => again.close(resolve))
  })
})
