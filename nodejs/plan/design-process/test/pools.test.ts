import { describe, expect, it } from 'vitest'

import { extractApiIdentity, loadApiPool, loadSchemaPool, parseIdentity } from '../src/pools.js'
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

  it('fails an $id without the leading slash (d-3wjypyx6)', () => {
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

describe('api pool (r-lll68661, d-u3u3sbmb)', () => {
  it('extracts identity from a typescript header', () => {
    expect(extractApiIdentity('apis/mc/server.ts', '// api: /mc-test-lib/server@2\nexport interface Server {}\n')).toBe(
      '/mc-test-lib/server@2',
    )
  })

  it('extracts identity from a yaml comment header', () => {
    expect(extractApiIdentity('apis/mc/server.yaml', '# api: /mc-test-lib/server@1\nname: server\n')).toBe(
      '/mc-test-lib/server@1',
    )
  })

  it('extracts identity from openapi info.x-api-id', () => {
    expect(
      extractApiIdentity('apis/http/api.yaml', 'openapi: 3.1.0\ninfo:\n  title: t\n  x-api-id: /demo/http@1\n'),
    ).toBe('/demo/http@1')
  })

  it('fails a file with no identity header, a malformed identity, and a duplicate', () => {
    const { tree } = makeRepo({
      'apis/a/one.ts': '// api: /demo/surface@1\n',
      'apis/a/two.ts': '// api: /demo/surface@1\n',
      'apis/a/three.ts': '// api: no-slash@1\n',
      'apis/a/four.ts': 'export {}\n',
    })
    const rules = loadApiPool(tree).findings.map((finding) => finding.rule)
    expect(rules).toContain('api-identity-unique')
    expect(rules.filter((rule) => rule === 'api-identity')).toHaveLength(2)
  })

  it('fails versions that are not dense per name', () => {
    const { tree } = makeRepo({ 'apis/a/one.ts': '// api: /demo/surface@2\n' })
    expect(loadApiPool(tree).findings.map((finding) => finding.rule)).toContain('api-versions-dense')
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
