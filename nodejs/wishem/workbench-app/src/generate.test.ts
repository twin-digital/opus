// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, '..', 'scripts', 'generate.ts')
const baseModel = join(import.meta.dirname, '..', '..', 'workbench', 'model')
const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const definitionPath = (model: string) => join(model, 'definitions', `${APP_BAR}.json`)

describe('the generate script', () => {
  let folder = ''
  let model = ''
  let views = ''

  const generate = (...args: string[]) => {
    const run = spawnSync('node', [script, '--model', model, '--views', views, ...args], { encoding: 'utf8' })
    return { code: run.status, lines: run.stdout.split('\n').filter((line) => line !== ''), stderr: run.stderr }
  }
  const sidecar = (name: string, componentType = APP_BAR) => {
    writeFileSync(join(views, `${name}.view.json`), JSON.stringify({ kind: 'react', componentType }))
  }
  const setLabel = (label: string) => {
    const path = definitionPath(model)
    writeFileSync(path, readFileSync(path, 'utf8').replace('"title"', JSON.stringify(label)))
  }

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'wishem-generate-'))
    model = join(folder, 'model')
    views = join(folder, 'views')
    cpSync(baseModel, model, { recursive: true })
    mkdirSync(views)
  })

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true })
  })

  it('writes the file of a sidecar and prints one line for it', () => {
    sidecar('AppBar')
    const run = generate()
    expect(run.code).toBe(0)
    expect(run.lines).toEqual([`wishem: model ${model}`, 'wishem: wrote AppBar.view.gen.ts: added title'])
    expect(existsSync(join(views, 'AppBar.view.gen.ts'))).toBe(true)
  })

  it('prints an error and exits with code 1 for a views folder that does not exist', () => {
    const missing = join(folder, 'typo')
    const run = spawnSync('node', [script, '--model', model, '--views', missing, '--check'], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stdout).toContain(`wishem: error: ${missing}: the views folder cannot be read`)
    expect(run.stdout).not.toContain('are current')
  })

  it('prints that the files are current, and changes no file', () => {
    sidecar('AppBar')
    generate()
    const before = readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')
    const run = generate()
    expect(run.code).toBe(0)
    expect(run.lines).toEqual([`wishem: model ${model}`, 'wishem: the generated files of 1 view are current'])
    expect(readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')).toBe(before)
  })

  it('prints the name of the file for a field that was added', () => {
    sidecar('AppBar')
    generate()
    const path = definitionPath(model)
    const definition = JSON.parse(readFileSync(path, 'utf8')) as { fields: object[] }
    definition.fields.push({ id: 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03', label: 'subtitle', type: 'string' })
    writeFileSync(path, JSON.stringify(definition))
    const run = generate()
    expect(run.code).toBe(0)
    expect(run.lines).toEqual([`wishem: model ${model}`, 'wishem: changed AppBar.view.gen.ts: added subtitle'])
    expect(readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')).toContain('readonly subtitle')
  })

  it('prints a line for a removed file', () => {
    sidecar('AppBar')
    generate()
    rmSync(join(views, 'AppBar.view.json'))
    const run = generate()
    expect(run.code).toBe(0)
    expect(run.lines).toEqual([`wishem: model ${model}`, 'wishem: removed AppBar.view.gen.ts'])
  })

  it('prints a warning and stops with exit code 0 for a sidecar before its definition', () => {
    sidecar('Header', 'ct_9d1e0000-0000-4000-8000-000000000000')
    const run = generate()
    expect(run.code).toBe(0)
    expect(run.lines[1]).toMatch(/^wishem: warning: Header\.view\.json: /)
    expect(run.lines).toContain('wishem: wrote Header.view.gen.ts')
  })

  it('prints each error of the generator and stops with a non-zero exit code', () => {
    sidecar('AppBar')
    const path = definitionPath(model)
    const definition = JSON.parse(readFileSync(path, 'utf8')) as { fields: object[] }
    definition.fields.push({ id: 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03', label: 'Title', type: 'string' })
    writeFileSync(path, JSON.stringify(definition))
    const run = generate()
    expect(run.code).not.toBe(0)
    expect(run.lines[1]).toBe(
      `wishem: error: AppBar.view.json: the fields fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62 and fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03 of the component type ${APP_BAR} give the same name "title"`,
    )
    expect(existsSync(join(views, 'AppBar.view.gen.ts'))).toBe(false)
  })

  it('prints the problem of a model file that is not valid JSON, and changes no file', () => {
    sidecar('AppBar')
    writeFileSync(definitionPath(model), '{ nope')
    const run = generate()
    expect(run.code).not.toBe(0)
    expect(run.lines.join('\n')).toContain(`wishem: problem in definitions/${APP_BAR}.json: the text is not valid JSON`)
    expect(readdirSync(views)).toEqual(['AppBar.view.json'])
  })

  describe('with --check', () => {
    it('stops with exit code 0 when each file is current', () => {
      sidecar('AppBar')
      generate()
      const run = generate('--check')
      expect(run.code).toBe(0)
      expect(run.lines).toEqual([`wishem: model ${model}`, 'wishem: the generated files of 1 view are current'])
    })

    it('names a file that is not current, changes no file, and stops with a non-zero exit code', () => {
      sidecar('AppBar')
      generate()
      const before = readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')
      setLabel('heading')
      const run = generate('--check')
      expect(run.code).toBe(1)
      expect(run.lines).toEqual([
        `wishem: model ${model}`,
        'wishem: AppBar.view.gen.ts is not current: added heading, removed title',
        'wishem: run the generate script, then correct each view that the type check names',
      ])
      expect(readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')).toBe(before)
    })
  })
})
