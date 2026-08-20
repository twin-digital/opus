/**
 * What the adventure's build actually shipped. Everything an actor is arrives through the kit's
 * merge of `@twin-digital/rpg-core`'s vendored tree, so the composed spellings — the identifier,
 * the type family, the asset names — exist only in built output and no unit test against the
 * library can observe them.
 *
 * The suite builds the pack through the package's own build script (the kit's, and the only route
 * to a built pack) and reads `dist/`.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const dist = (...parts: string[]): string => [packageDir, 'dist', ...parts].join('/')
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as never

/** The namespace the kit derives from this package's name, and the prefix rpg-core ships. */
const NAMESPACE = 'twin-digital-rpg-core-example'
const WIZARD_ID = `${NAMESPACE}:rpg.wizard`
const FAMILY = `mcdk_pack_${NAMESPACE}`

beforeAll(() => {
  execFileSync('pnpm', ['build'], { cwd: packageDir, stdio: 'ignore' })
}, 120_000)

describe('the built pack', () => {
  it('spells the wizard under this adventure’s namespace and rpg-core’s prefix', () => {
    const entities = readdirSync(dist('behavior_pack', 'entities'))
      .map((file) => readJson(dist('behavior_pack', 'entities', file)))
      .map((json) => (json['minecraft:entity'] as { description: { identifier: string } }).description.identifier)

    expect(entities).toContain(WIZARD_ID)
    // the adventure names no prefix of its own: `rpg` is rpg-core's shipped default
    const manifest = readJson(`${packageDir}/package.json`) as { minecraft?: unknown }
    expect(manifest.minecraft).toBeUndefined()
  })

  it('stamps the build’s own type family on the wizard, and the wizard declares none', () => {
    const wizard = readdirSync(dist('behavior_pack', 'entities'))
      .map((file) => readJson(dist('behavior_pack', 'entities', file)))
      .find(
        (json) =>
          (json['minecraft:entity'] as { description: { identifier: string } }).description.identifier === WIZARD_ID,
      )
    const components = (wizard?.['minecraft:entity'] as { components: Record<string, unknown> }).components
    expect(components['minecraft:type_family']).toEqual({ family: [FAMILY] })
  })

  it('composes the same identifier at run time as the definition it shipped', () => {
    const script = readFileSync(dist('behavior_pack', 'scripts', 'main.js'), 'utf8')
    const namespace = /namespace: "(?<value>[^"]+)"/u.exec(script)?.groups?.value
    const prefix = /prefixes: Object\.freeze\(\["(?<value>[^"]+)"/u.exec(script)?.groups?.value

    expect(`${namespace}:${prefix}.wizard`).toBe(WIZARD_ID)
  })

  it('ships the appearance the adventure never wrote, in its own resource half', () => {
    const resource = readdirSync(dist('resource_pack'), { recursive: true }) as string[]
    for (const kind of ['entity', 'models', 'textures', 'animations', 'render_controllers']) {
      expect(
        resource.some((entry) => entry.startsWith(kind)),
        `no ${kind} in the built resource pack`,
      ).toBe(true)
    }

    // and the adventure's author wrote none of it: nothing in the committed tree is actor content
    const committed = execFileSync('git', ['ls-files'], { cwd: packageDir, encoding: 'utf8' }).split('\n')
    expect(committed.filter((entry) => /\.(png|tga|geo\.json|animation\.json|entity\.json)$/u.test(entry))).toEqual([])
    expect(committed.filter((entry) => entry.startsWith('behavior_pack/entities/'))).toEqual([])
  })

  it('activates its own resource half from its behavior manifest', () => {
    const behavior = readJson(dist('behavior_pack', 'manifest.json')) as {
      dependencies: { uuid?: string }[]
    }
    const resource = readJson(dist('resource_pack', 'manifest.json')) as { header: { uuid: string } }
    expect(behavior.dependencies.map((entry) => entry.uuid)).toContain(resource.header.uuid)
  })
})
