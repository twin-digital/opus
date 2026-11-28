// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { generateViewTypes, renderViewTypes, viewTypesLines, type ViewTypesResult } from './view-types.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FIELD_A = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FIELD_B = 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03'
const COMMAND = 'pnpm --filter my-product generate'

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
// To write this file again: ${COMMAND}

/** The fields of the component type "AppBar" (${APP_BAR}). */
export interface Props {
  /** The field "title" (${TITLE}). */
  readonly title: string | undefined
}
`

describe('renderViewTypes', () => {
  it('gives the text of the design for the definition of AppBar', () => {
    expect(renderViewTypes('AppBar.view.json', APP_BAR, COMMAND, appBar('title'))).toBe(EXPECTED_APP_BAR)
  })

  it('gives one member for each field, in the order of the definition', () => {
    const text = renderViewTypes('AppBar.view.json', APP_BAR, COMMAND, appBar('title', 'subtitle'))
    expect(text).toBe(
      EXPECTED_APP_BAR.replace(
        '  readonly title: string | undefined\n',
        `  readonly title: string | undefined\n  /** The field "subtitle" (${FIELD_B}). */\n  readonly subtitle: string | undefined\n`,
      ),
    )
  })

  it('escapes the end of a comment in a label', () => {
    const text = renderViewTypes(
      'AppBar.view.json',
      APP_BAR,
      COMMAND,
      definition(APP_BAR, 'App */ Bar', [TITLE, 'a */ b']),
    )
    expect(text).toContain('"App *\\/ Bar"')
    expect(text).toContain('"a *\\/ b"')
    expect(text).not.toContain('*/ ')
  })

  it('gives a Props type with no member when there is no definition', () => {
    const text = renderViewTypes('Header.view.json', APP_BAR, COMMAND)
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
    generateViewTypes({ definitions, views, command: COMMAND, check })

  beforeEach(() => {
    views = mkdtempSync(join(tmpdir(), 'wishem-view-types-'))
  })

  afterEach(() => {
    rmSync(views, { recursive: true, force: true })
  })

  it('gives one error that names a views folder that does not exist', async () => {
    const missing = join(views, 'typo')
    const result = await generateViewTypes({ definitions: [appBar('title')], views: missing, command: COMMAND })
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

  it('names the command of the caller in the header of each file that it writes', async () => {
    sidecar('AppBar')
    sidecar('Header', { kind: 'react', componentType: 'ct_cccccccc-0000-4000-8000-000000000003' })
    await generateViewTypes({ definitions: [appBar('title')], views, command: 'pnpm --filter other-product regen' })
    for (const name of ['AppBar', 'Header']) {
      expect(readFileSync(generated(name), 'utf8')).toContain(
        '// To write this file again: pnpm --filter other-product regen\n',
      )
    }
  })

  it('finds a file that names a different command not current', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    const result = await generateViewTypes({
      definitions: [appBar('title')],
      views,
      command: 'pnpm --filter other-product regen',
      check: true,
    })
    expect(result.files.map((file) => file.status)).toEqual(['not-current'])
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

    it('gives one error for each label that gives no usable name', async () => {
      sidecar('AppBar')
      const result = await run([definition(APP_BAR, 'AppBar', [FIELD_A, '2nd line'], [FIELD_B, '--'])])
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain(FIELD_A)
      expect(result.errors[1]).toContain(FIELD_B)
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

  it('gives an error that says the file cannot be read for a sidecar that is not a file', async () => {
    mkdirSync(join(views, 'Dir.view.json'))
    const result = await run([appBar('title')])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Dir.view.json: the file cannot be read')
  })

  it('keeps the generated file of a sidecar that is not valid JSON', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    sidecar('AppBar', '{ not json')
    const result = await run([appBar('title')])
    expect(result.errors).toHaveLength(1)
    expect(result.files).toEqual([])
    expect(readFileSync(generated('AppBar'), 'utf8')).toBe(EXPECTED_APP_BAR)
  })

  it('keeps the generated file of a sidecar that has no componentType', async () => {
    sidecar('AppBar')
    await run([appBar('title')])
    sidecar('AppBar', { kind: 'react' })
    const result = await run([appBar('title')])
    expect(result.errors).toHaveLength(1)
    expect(result.files).toEqual([])
    expect(readFileSync(generated('AppBar'), 'utf8')).toBe(EXPECTED_APP_BAR)
  })

  it('lists the files in the order of their names', async () => {
    sidecar('Zed')
    writeFileSync(generated('Alpha'), 'export type Props = object\n')
    const result = await run([appBar('title')])
    expect(result.files.map((file) => [file.file, file.status])).toEqual([
      ['Alpha.view.gen.ts', 'removed'],
      ['Zed.view.gen.ts', 'written'],
    ])
  })

  it('gives an error for a generated file that cannot be read when it checks', async () => {
    sidecar('AppBar')
    mkdirSync(generated('AppBar'))
    const result = await run([appBar('title')], true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('AppBar.view.gen.ts')
    expect(result.files).toEqual([])
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

describe('viewTypesLines', () => {
  const result = (overrides: Partial<ViewTypesResult>): ViewTypesResult => ({
    files: [],
    warnings: [],
    errors: [],
    ...overrides,
  })

  it('gives no line for a result with no file and no message', () => {
    expect(viewTypesLines(result({}))).toEqual([])
  })

  it('gives no line for a current file', () => {
    expect(
      viewTypesLines(
        result({ files: [{ file: 'A.view.gen.ts', status: 'current', addedProps: [], removedProps: [] }] }),
      ),
    ).toEqual([])
  })

  it('gives one line for a written file, with the added props', () => {
    const lines = viewTypesLines(
      result({
        files: [{ file: 'A.view.gen.ts', status: 'written', addedProps: ['title', 'icon'], removedProps: [] }],
      }),
    )
    expect(lines).toEqual(['wishem: wrote A.view.gen.ts: added title, icon'])
  })

  it('gives one line for a changed file, with the added and the removed props', () => {
    const lines = viewTypesLines(
      result({
        files: [{ file: 'A.view.gen.ts', status: 'changed', addedProps: ['heading'], removedProps: ['title'] }],
      }),
    )
    expect(lines).toEqual(['wishem: changed A.view.gen.ts: added heading, removed title'])
  })

  it('gives one line for a removed file, with no list of props', () => {
    const lines = viewTypesLines(
      result({ files: [{ file: 'A.view.gen.ts', status: 'removed', addedProps: [], removedProps: ['title'] }] }),
    )
    expect(lines).toEqual(['wishem: removed A.view.gen.ts'])
  })

  it('gives one line for a file that is not current', () => {
    const lines = viewTypesLines(
      result({ files: [{ file: 'A.view.gen.ts', status: 'not-current', addedProps: [], removedProps: ['title'] }] }),
    )
    expect(lines).toEqual(['wishem: A.view.gen.ts is not current: removed title'])
  })

  it('gives no list of props after a written file that has no change of props', () => {
    const lines = viewTypesLines(
      result({ files: [{ file: 'A.view.gen.ts', status: 'written', addedProps: [], removedProps: [] }] }),
    )
    expect(lines).toEqual(['wishem: wrote A.view.gen.ts'])
  })

  it('gives a line for a warning and a line for an error, before the lines of the files', () => {
    const lines = viewTypesLines(
      result({
        warnings: ['first warning'],
        errors: ['first error'],
        files: [{ file: 'A.view.gen.ts', status: 'removed', addedProps: [], removedProps: [] }],
      }),
    )
    expect(lines).toEqual([
      'wishem: warning: first warning',
      'wishem: error: first error',
      'wishem: removed A.view.gen.ts',
    ])
  })
})
