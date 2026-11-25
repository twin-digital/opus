// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateModel, type ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes, renderViewTypes } from '../scripts/view-types.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FIELD_A = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FIELD_B = 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03'

const definition = (id: string, label: string, ...fields: [string, string][]): ComponentTypeDefinition => ({
  id,
  label,
  fields: fields.map(([fieldId, fieldLabel]) => ({ id: fieldId, label: fieldLabel, type: 'string' })),
})

const appBar = (...labels: string[]) =>
  definition(
    APP_BAR,
    'AppBar',
    ...labels.map((label, index): [string, string] => [index === 0 ? TITLE : FIELD_B, label]),
  )

const EXPECTED_APP_BAR = `// Generated from AppBar.view.json and the definition of its component type. Do not edit.
// To write this file again: pnpm --filter @thrashplay/wishem-workbench-app generate

/** The fields of the component type "AppBar" (${APP_BAR}). */
export interface Props {
  /** The field "title" (${TITLE}). */
  readonly title: string | undefined
}
`

describe('renderViewTypes', () => {
  it('gives the text of the design for the definition of AppBar', () => {
    expect(renderViewTypes('AppBar.view.json', APP_BAR, appBar('title'))).toBe(EXPECTED_APP_BAR)
  })

  it('gives a Props type with no member when there is no definition', () => {
    const text = renderViewTypes('Header.view.json', APP_BAR)
    expect(text).toContain('export type Props = object')
    expect(text).not.toContain('readonly')
  })
})

describe('generateViewTypes', () => {
  let views = ''

  const sidecar = (name: string, content: unknown = { kind: 'react', componentType: APP_BAR }) => {
    writeFileSync(join(views, `${name}.view.json`), typeof content === 'string' ? content : JSON.stringify(content))
  }
  const generated = (name: string) => join(views, `${name}.view.gen.ts`)
  const run = (definitions: ComponentTypeDefinition[], check = false) =>
    generateViewTypes({ definitions, views, check })

  beforeEach(() => {
    views = mkdtempSync(join(tmpdir(), 'wishem-view-types-'))
  })

  afterEach(() => {
    rmSync(views, { recursive: true, force: true })
  })

  it('gives one error that names a views folder that does not exist', async () => {
    const missing = join(views, 'typo')
    const result = await generateViewTypes({ definitions: [appBar('title')], views: missing })
    expect(result.files).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(`${missing}: the views folder cannot be read`)
  })

  it('writes a file on a first run', async () => {
    sidecar('AppBar')
    const result = await run([appBar('title')])
    expect(result.files).toEqual([
      { file: 'AppBar.view.gen.ts', status: 'written', addedProps: ['title'], removedProps: [] },
    ])
    expect(result.errors).toEqual([])
    expect(readFileSync(generated('AppBar'), 'utf8')).toBe(EXPECTED_APP_BAR)
  })

  it('writes nothing on a second run, and keeps the file time', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(generated('AppBar'), old, old)
    const result = await run([appBar('title')])
    expect(result.files).toEqual([{ file: 'AppBar.view.gen.ts', status: 'current', addedProps: [], removedProps: [] }])
    expect(statSync(generated('AppBar')).mtimeMs).toBe(old.getTime())
  })

  it('reports a new field', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    const result = await run([appBar('title', 'subtitle')])
    expect(result.files).toEqual([
      { file: 'AppBar.view.gen.ts', status: 'changed', addedProps: ['subtitle'], removedProps: [] },
    ])
  })

  it('reports a changed label as one added name and one removed name', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    const result = await run([appBar('heading')])
    expect(result.files).toEqual([
      { file: 'AppBar.view.gen.ts', status: 'changed', addedProps: ['heading'], removedProps: ['title'] },
    ])
  })

  it('removes a generated file that has no sidecar', async () => {
    writeFileSync(
      generated('Header'),
      '// Generated\nexport interface Props {\n  readonly title: string | undefined\n}\n',
    )
    const result = await run([appBar('title')])
    expect(result.files).toEqual([
      { file: 'Header.view.gen.ts', status: 'removed', addedProps: [], removedProps: ['title'] },
    ])
    expect(existsSync(generated('Header'))).toBe(false)
  })

  it('gives no file to a sidecar whose kind is not react', async () => {
    sidecar('AppBar', { kind: 'vue', componentType: APP_BAR })
    const result = await run([appBar('title')])
    expect(result).toEqual({ files: [], warnings: [], errors: [] })
    expect(existsSync(generated('AppBar'))).toBe(false)
  })

  it('writes an empty type and warns when the component type has no definition', async () => {
    sidecar('Header')
    const result = await run([])
    expect(result.errors).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Header.view.json')
    expect(result.warnings[0]).toContain(APP_BAR)
    expect(readFileSync(generated('Header'), 'utf8')).toContain('export type Props = object')
  })

  describe('a label that gives no usable name', () => {
    it('gives an error for two labels with one name', async () => {
      sidecar('AppBar')
      const bad = definition(APP_BAR, 'AppBar', [FIELD_A, 'Max health'], [FIELD_B, 'max-health'])
      const result = await run([bad])
      expect(result.errors).toHaveLength(1)
      for (const part of ['AppBar.view.json', APP_BAR, FIELD_A, FIELD_B, 'maxHealth']) {
        expect(result.errors[0]).toContain(part)
      }
      expect(result.files).toEqual([])
      expect(existsSync(generated('AppBar'))).toBe(false)
    })

    it('gives an error for a name that starts with a digit', async () => {
      sidecar('AppBar')
      const result = await run([definition(APP_BAR, 'AppBar', [FIELD_A, '2nd line'])])
      expect(result.errors).toHaveLength(1)
      for (const part of ['AppBar.view.json', APP_BAR, FIELD_A]) {
        expect(result.errors[0]).toContain(part)
      }
      expect(existsSync(generated('AppBar'))).toBe(false)
    })

    it('gives an error for an empty name', async () => {
      sidecar('AppBar')
      const result = await run([definition(APP_BAR, 'AppBar', [FIELD_A, '--'])])
      expect(result.errors).toHaveLength(1)
      for (const part of ['AppBar.view.json', APP_BAR, FIELD_A]) {
        expect(result.errors[0]).toContain(part)
      }
      expect(existsSync(generated('AppBar'))).toBe(false)
    })
  })

  it('gives an error for a sidecar that is not valid JSON, and writes the other files', async () => {
    sidecar('Broken', '{ not json')
    sidecar('AppBar')
    const result = await run([appBar('title')])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Broken.view.json')
    expect(result.files.map((file) => file.file)).toEqual(['AppBar.view.gen.ts'])
    expect(existsSync(generated('Broken'))).toBe(false)
  })

  it('gives an error for a sidecar with no componentType', async () => {
    sidecar('AppBar', { kind: 'react' })
    const result = await run([appBar('title')])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('AppBar.view.json')
  })

  it('keeps the generated file of a sidecar that has an error', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    const result = await run([definition(APP_BAR, 'AppBar', [FIELD_A, 'a b'], [FIELD_B, 'A-B'])])
    expect(result.errors).toHaveLength(1)
    expect(readFileSync(generated('AppBar'), 'utf8')).toBe(EXPECTED_APP_BAR)
  })

  describe('with check', () => {
    it('changes no file and finds a file that is not current', async () => {
      sidecar('AppBar')
      await run([appBar('title')])
      const result = await run([appBar('heading')], true)
      expect(result.files).toEqual([
        { file: 'AppBar.view.gen.ts', status: 'not-current', addedProps: ['heading'], removedProps: ['title'] },
      ])
      expect(readFileSync(generated('AppBar'), 'utf8')).toBe(EXPECTED_APP_BAR)
    })

    it('does not write a missing file', async () => {
      sidecar('AppBar')
      const result = await run([appBar('title')], true)
      expect(result.files[0]?.status).toBe('not-current')
      expect(existsSync(generated('AppBar'))).toBe(false)
    })

    it('does not remove a file that has no sidecar', async () => {
      writeFileSync(generated('Header'), 'export type Props = object\n')
      const result = await run([], true)
      expect(result.files[0]).toMatchObject({ file: 'Header.view.gen.ts', status: 'not-current' })
      expect(existsSync(generated('Header'))).toBe(true)
    })

    it('finds each file current', async () => {
      sidecar('AppBar')
      await run([appBar('title')])
      const result = await run([appBar('title')], true)
      expect(result.files.map((file) => file.status)).toEqual(['current'])
    })
  })
})

describe('the generated files of the repository', () => {
  it('are current', async () => {
    const folder = await readModelFolder(modelFolder)
    const validation = validateModel(folder.data)
    if (!validation.ok) {
      throw new Error('the base model is not correct')
    }
    const result = await generateViewTypes({
      definitions: validation.model.definitions,
      views: join(import.meta.dirname, 'views'),
      check: true,
    })
    expect(result.errors).toEqual([])
    expect(result.files.filter((file) => file.status === 'not-current').map((file) => file.file)).toEqual([])
  })
})
