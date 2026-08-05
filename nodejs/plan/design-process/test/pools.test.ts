import { describe, expect, it } from 'vitest'

import { extractSurfaceIdentity, loadSchemaPool, loadSurfacePool, parseIdentity } from '../src/pools.js'
import { makeRepo, poolFiles } from './helpers.js'

describe('schema pool (r-2fytqadu)', () => {
  it('loads the design-process pool cleanly', () => {
    const { tree } = makeRepo(poolFiles())
    const pool = loadSchemaPool(tree)
    expect(pool.findings).toEqual([])
    expect(pool.entries.has('/design-process/requirements@1')).toBe(true)
  })

  it('fails two files claiming one identity', () => {
    const files = poolFiles()
    files['schemas/elsewhere/copy.yaml'] = files['schemas/design-process/common.1.yaml']!
    const pool = loadSchemaPool(makeRepo(files).tree)
    expect(pool.findings.map((finding) => finding.rule)).toContain('schema-identity-unique')
  })

  it('fails an $id without the leading slash (d-qwquvf78)', () => {
    const files = poolFiles()
    files['schemas/demo/bad.yaml'] =
      '$schema: https://json-schema.org/draft/2020-12/schema\n$id: demo/bad@1\ntype: object\n'
    const pool = loadSchemaPool(makeRepo(files).tree)
    expect(pool.findings.map((finding) => finding.rule)).toContain('schema-identity')
  })

  it('fails versions that are not dense per entity', () => {
    const files = poolFiles()
    files['schemas/demo/thing.3.yaml'] =
      '$schema: https://json-schema.org/draft/2020-12/schema\n$id: /demo/thing@3\ntype: object\n'
    const pool = loadSchemaPool(makeRepo(files).tree)
    expect(pool.findings.map((finding) => finding.rule)).toContain('schema-versions-dense')
  })
})

describe('surface pool (r-j232vwp4, d-rui9z0lc)', () => {
  it('extracts identity from a typescript comment (d-ds6mco0p)', () => {
    expect(
      extractSurfaceIdentity(
        'surfaces/mc/server.ts',
        '// surface: /mc-test-lib/server@2\nexport interface Server {}\n',
      ),
    ).toBe('/mc-test-lib/server@2')
  })

  it('extracts identity from a yaml comment (d-tjitou0m)', () => {
    expect(extractSurfaceIdentity('surfaces/mc/server.yaml', '# surface: /mc-test-lib/server@1\nname: server\n')).toBe(
      '/mc-test-lib/server@1',
    )
  })

  it('extracts identity from openapi info.x-api-id (d-6ier9trn)', () => {
    expect(
      extractSurfaceIdentity('surfaces/http/api.yaml', 'openapi: 3.1.0\ninfo:\n  title: t\n  x-api-id: /demo/http@1\n'),
    ).toBe('/demo/http@1')
  })

  it('extracts identity from markdown frontmatter (d-4n77krzi)', () => {
    expect(
      extractSurfaceIdentity('surfaces/docs/page.md', '---\nio.twindigital.surface: /demo/page@1\n---\n\n# Page\n'),
    ).toBe('/demo/page@1')
  })

  it('fails a file with no identity, a malformed identity, and a duplicate', () => {
    const { tree } = makeRepo({
      'surfaces/a/one.ts': '// surface: /demo/screen@1\n',
      'surfaces/a/two.ts': '// surface: /demo/screen@1\n',
      'surfaces/a/three.ts': '// surface: no-slash@1\n',
      'surfaces/a/four.ts': 'export {}\n',
    })
    const rules = loadSurfacePool(tree).findings.map((finding) => finding.rule)
    expect(rules).toContain('surface-identity-unique')
    expect(rules.filter((rule) => rule === 'surface-identity')).toHaveLength(2)
  })

  it('fails versions that are not dense per name', () => {
    const { tree } = makeRepo({ 'surfaces/a/one.ts': '// surface: /demo/screen@2\n' })
    expect(loadSurfacePool(tree).findings.map((finding) => finding.rule)).toContain('surface-versions-dense')
  })
})

describe('parseIdentity', () => {
  it('requires a leading slash, at least two segments, and a version', () => {
    expect(parseIdentity('/design-process/requirements@1')).toEqual({
      name: '/design-process/requirements',
      version: 1,
    })
    expect(parseIdentity('design-process/requirements@1')).toBeUndefined()
    expect(parseIdentity('/requirements@1')).toBeUndefined()
    expect(parseIdentity('/design-process/requirements')).toBeUndefined()
  })
})
