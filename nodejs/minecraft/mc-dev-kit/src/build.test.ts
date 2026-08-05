import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { packBuild } from './build.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Record<
  string,
  Record<string, unknown>
>

const fragment = packBuild({ packageDir: '/workspace/packages/mc-pack-1' })

describe('the build half ships in the kit package', () => {
  it('exports the fragment from the kit package, under its own subpath', () => {
    expect(packageJson.exports['./build']).toMatchObject({
      import: { source: './src/build.ts', import: './dist/build.js' },
    })
  })

  it('embeds no bundler at runtime — tsdown is a development dependency alone', () => {
    expect(packageJson.dependencies).not.toHaveProperty('tsdown')
    expect(packageJson.devDependencies).toHaveProperty('tsdown')
  })

  it('declares one command, and it is the archive half', () => {
    expect(packageJson.bin).toEqual({ 'mc-pack-archive': './bin/mc-pack-archive.js' })
  })
})

describe('packBuild', () => {
  it('returns a fragment carrying exactly one plugin', () => {
    const plugins = fragment.plugins as { name: string }[]

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({ name: 'mc-dev-kit:pack-build' })
  })

  it('points the output at the script location the pack set reports', () => {
    expect(fragment.outDir).toBe(path.join('/workspace/packages/mc-pack-1/dist/behavior_pack/scripts'))
    expect(fragment.outputOptions).toMatchObject({ entryFileNames: 'main.js' })
  })

  it('sets every setting the build depends on, rather than inheriting it', () => {
    for (const key of [
      'clean',
      'dts',
      'entry',
      'format',
      'inputOptions',
      'minify',
      'noExternal',
      'outDir',
      'outputOptions',
      'platform',
      'shims',
      'sourcemap',
      'target',
    ]) {
      expect(fragment, key).toHaveProperty(key)
    }
  })

  it('sets what the script engine forces', () => {
    expect(fragment.target).toBe('es2022')
    expect(fragment.platform).toBe('neutral')
    expect(fragment.shims).toBe(false)
    expect(fragment.format).toBe('esm')
  })

  it('leaves the output directory standing, so the end-of-build prune has its inputs', () => {
    expect(fragment.clean).toBe(false)
  })

  it('produces one unminified chunk with no declarations and no sourcemap', () => {
    expect(fragment.minify).toBe(false)
    expect(fragment.dts).toBe(false)
    expect(fragment.sourcemap).toBe(false)
  })

  it('keeps workspace dependencies inlined from source', () => {
    expect(fragment.inputOptions).toMatchObject({ resolve: { conditionNames: ['source'] } })
  })

  it('names the virtual entry where the package holds no script sources', () => {
    expect(fragment.entry).toEqual(['mc-dev-kit:pack-entry'])
  })
})

describe.todo('the plugin builds the package', () => {
  it.todo('takes the package’s packs from the kit’s pack set, resolving the root by ascent')
  it.todo('fails naming the file when the kit’s enumeration rejects')
  it.todo('fails naming the package directory when the kit reports no pack')
  it.todo('fails with the kit’s problems printed when a pack is invalid, building no sibling pack')
  it.todo('fails when the pack set reports a script location that is not the configured one')
  it.todo('marks each module_name dependency of the completed manifests external')
  it.todo('fails an undeclared @minecraft/ import only where nothing importable resolves')
  it.todo('writes the completed manifest as two-space JSON with a trailing newline')
  it.todo('copies every other pack file verbatim, dotfiles and unknown extensions included')
  it.todo('copies nothing under behavior_pack/scripts/')
  it.todo('creates no output directory for an empty source directory')
  it.todo('writes a file only where its bytes differ from what already sits there')
  it.todo('drops an unchanged chunk before the bundler writes it')
  it.todo('prunes output the build did not write, with no clean step first')
  it.todo('prunes a chunk no pack claims')
  it.todo('writes no report of which packs changed')
  it.todo('builds a resource-pack-only package, applying no script location check')
  it.todo('fails at buildStart when the virtual entry was configured over sources on disk')
  it.todo('fails when a declared script module has no sources')
  it.todo(
    'registers the pack source directories, source manifests, package.json, and each depended-on package.json as watch inputs',
  )
})
