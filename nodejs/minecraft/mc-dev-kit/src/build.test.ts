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

  it('depends on the engine-side runtime package, so it reaches a consuming pack’s node_modules', () => {
    expect(packageJson.dependencies).toHaveProperty('@twin-digital/mc-pack-runtime')
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

  it('takes the namespace setting beside packageDir, and the fragment is the same shape', () => {
    for (const namespace of [true, 'wizards'] as const) {
      const namespaced = packBuild({ namespace, packageDir: '/workspace/packages/mc-pack-1' })
      const plugins = namespaced.plugins as { name: string }[]

      expect(plugins).toHaveLength(1)
      expect(plugins[0]).toMatchObject({ name: 'mc-dev-kit:pack-build' })
    }
  })
})

// the plugin's own build cases run against real builds, in internal/pack-build.test.ts

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')

describe('the export is documented', () => {
  it('states how a consuming package takes the export up', () => {
    expect(readme).toMatch(/^## Build$/m)
    expect(readme).toMatch(/import \{ packBuild \} from '@twin-digital\/mc-dev-kit\/build'/)
    expect(readme).toMatch(/packBuild\(\{ packageDir/)
  })

  it('states what using it produces', () => {
    for (const produced of [
      'dist/<kind>_pack/manifest.json',
      'dist/behavior_pack/scripts/main.js',
      'copied verbatim',
      'What fails the build',
    ]) {
      expect(readme, produced).toContain(produced)
    }
  })

  it('documents namespacing and vendoring, sending an author who overrides the default to the registry', () => {
    expect(readme).toMatch(/^### Namespacing$/m)
    expect(readme).toMatch(/^### Vendoring shared packs$/m)
    // the registry a chosen namespace is claimed at, which the build neither reads nor requires
    expect(readme).toContain('https://github.com/Bedrock-OSS/add-on-registry')
    expect(readme).toMatch(/neither reads the registry nor requires an entry/)
    // what a shared pack's package must publish for anyone to vendor it
    expect(readme).toContain('"files": ["vendored_pack"]')
  })

  it('carries the same documentation as TSDoc on the exported function', async () => {
    const source = await readFile(new URL('./build.ts', import.meta.url), 'utf8')
    const tsdoc = source.slice(
      source.indexOf('/**', source.indexOf('PackBuildOptions')),
      source.indexOf('export function packBuild'),
    )

    expect(tsdoc).toContain('@param options')
    expect(tsdoc).toContain('@returns')
    expect(tsdoc).toContain('packBuild')
  })
})
