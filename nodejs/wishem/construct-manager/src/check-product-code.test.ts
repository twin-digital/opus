import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { checkProductCode } from './node.js'

const SAMPLE_CODE = new URL('../../sample-product/dist/index.js', import.meta.url).href

describe('checkProductCode', () => {
  let folder = ''

  const writeCode = async (name: string, text: string) => {
    const file = join(folder, name)
    await writeFile(file, text)
    return pathToFileURL(file).href
  }

  afterEach(async () => {
    if (folder !== '') {
      await rm(folder, { recursive: true, force: true })
    }
  })

  const setup = async () => {
    folder = await mkdtemp(join(tmpdir(), 'wishem-check-product-code-'))
  }

  it('gives ok and the number of behaviors for the product code of the sample product', async () => {
    expect(await checkProductCode(SAMPLE_CODE)).toEqual({ ok: true, count: 2 })
  })

  it('gives load with the error of the import for a missing file', async () => {
    await setup()
    const url = pathToFileURL(join(folder, 'missing.mjs')).href
    const result = await checkProductCode(url)
    expect(result).toMatchObject({ ok: false, reason: 'load' })
    expect(result.ok ? '' : result.message).toContain('missing.mjs')
  })

  it('gives behaviors for a module with no behaviors', async () => {
    await setup()
    const url = await writeCode('none.mjs', 'export const other = 1\n')
    expect(await checkProductCode(url)).toEqual({
      ok: false,
      reason: 'behaviors',
      message: 'The behaviors are not a list.',
    })
  })

  it('gives behaviors for a module whose behaviors are the text count', async () => {
    await setup()
    const url = await writeCode('text.mjs', "export const behaviors = 'count'\n")
    expect(await checkProductCode(url)).toEqual({
      ok: false,
      reason: 'behaviors',
      message: 'The behaviors are not a list.',
    })
  })

  it('gives load for a module that does not end at its top level, and the process ends', async () => {
    await setup()
    const pidFile = join(folder, 'pid.txt')
    const url = await writeCode(
      'loop.mjs',
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid))\nfor (;;) {}\n`,
    )
    expect(await checkProductCode(url, { answerMs: 1000 })).toEqual({
      ok: false,
      reason: 'load',
      message: 'The check did not end in 1 second.',
    })
    const pid = Number(await readFile(pidFile, 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('runs the module in a process that is not this process', async () => {
    await setup()
    const pidFile = join(folder, 'pid.txt')
    const url = await writeCode(
      'pid.mjs',
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid))\nexport const behaviors = []\n`,
    )
    expect(await checkProductCode(url)).toEqual({ ok: true, count: 0 })
    expect(Number(await readFile(pidFile, 'utf8'))).not.toBe(process.pid)
  })
})
