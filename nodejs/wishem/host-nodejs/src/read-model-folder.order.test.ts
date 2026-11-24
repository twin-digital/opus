import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readModelFolder } from './read-model-folder.js'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readdir: () => Promise.resolve(['c.json', 'a.json', 'notes.txt', 'b.json']),
}))

describe('readModelFolder when the file system lists the files in no order', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-order-'))
    await mkdir(path.join(folder, 'definitions'))
    for (const name of ['a', 'b', 'c']) {
      await writeFile(path.join(folder, 'definitions', `${name}.json`), JSON.stringify({ name }))
    }
    await writeFile(path.join(folder, 'state.json'), JSON.stringify({ entities: [] }))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('reads the definition files in the order of their names', async () => {
    const result = await readModelFolder(folder)
    expect(result.definitionFiles).toEqual(['a', 'b', 'c'].map((name) => path.join('definitions', `${name}.json`)))
    expect((result.data as { definitions: unknown[] }).definitions).toEqual([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ])
  })
})
