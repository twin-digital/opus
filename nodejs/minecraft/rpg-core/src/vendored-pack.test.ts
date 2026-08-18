/**
 * The `vendored_pack/` tree, read as source: the adventure's build composes every identifier and
 * every asset name in it, so what is committed here is spelled bare. This package runs no pack
 * build of its own (d-f2mk1u7n), so these are the checks that hold the tree to its shape.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRESET_NAMES } from './presets.js'

interface BehaviorEntityFile {
  'minecraft:entity': {
    description: { identifier: string; is_spawnable?: boolean; is_summonable?: boolean }
    components: Record<string, unknown>
  }
}

interface ClientEntityDescription {
  identifier: string
  materials?: Record<string, string>
  geometry?: Record<string, string>
  textures?: Record<string, string>
  animations?: Record<string, string>
  render_controllers?: string[]
}

interface ClientEntityFile {
  'minecraft:client_entity': { description: ClientEntityDescription }
}

const packageRoot = path.join(new URL('.', import.meta.url).pathname, '..')
const packRoot = path.join(packageRoot, 'vendored_pack')

const readText = (relative: string): string => readFileSync(path.join(packRoot, relative), 'utf8')
const readJson = (relative: string): unknown => JSON.parse(readText(relative))

const filesIn = (relativeDir: string, suffix: string): string[] =>
  readdirSync(path.join(packRoot, relativeDir))
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(relativeDir, name))

const behaviorEntities = filesIn('behavior_pack/entities', '.json').map((file) => {
  const entity = (readJson(file) as BehaviorEntityFile)['minecraft:entity']
  return {
    file,
    identifier: entity.description.identifier,
    description: entity.description,
    components: entity.components,
  }
})

const clientEntities = filesIn('resource_pack/entity', '.entity.json').map((file) => ({
  file,
  description: (readJson(file) as ClientEntityFile)['minecraft:client_entity'].description,
}))

const declaredNames = (relativeDir: string, suffix: string, key: string): { file: string; names: string[] }[] =>
  filesIn(relativeDir, suffix).map((file) => ({
    file,
    names: Object.keys((readJson(file) as Record<string, Record<string, unknown>>)[key]),
  }))

describe('the package bears no pack of its own', () => {
  it('declares no manifest in either half', () => {
    for (const half of ['behavior_pack', 'resource_pack']) {
      expect(existsSync(path.join(packRoot, half, 'manifest.json')), half).toBe(false)
    }
  })
})

describe('one definition per preset, named bare', () => {
  it('gives every preset a behavior entity definition under its bare preset name', () => {
    for (const preset of PRESET_NAMES) {
      expect(behaviorEntities.map((e) => e.identifier)).toContain(preset)
    }
  })

  it('gives every preset a client entity definition under its bare preset name', () => {
    for (const preset of PRESET_NAMES) {
      expect(clientEntities.map((e) => e.description.identifier)).toContain(preset)
    }
  })

  it('commits no entity definition the catalogue does not claim', () => {
    for (const { file, identifier } of behaviorEntities) {
      expect(PRESET_NAMES as readonly string[], file).toContain(identifier)
    }
    for (const { file, description } of clientEntities) {
      expect(PRESET_NAMES as readonly string[], file).toContain(description.identifier)
    }
  })

  it('carries no namespace and no dot in any entity identifier — the build composes both', () => {
    for (const { file, identifier } of behaviorEntities) {
      expect(identifier, file).not.toMatch(/[:.]/)
    }
    for (const { file, description } of clientEntities) {
      expect(description.identifier, file).not.toMatch(/[:.]/)
    }
  })
})

describe('shared actor components', () => {
  it('leaves gravity in force: an actor stands on the ground like anything else', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:physics'], file).toMatchObject({ has_gravity: true })
    }
  })

  it('blocks every stoppable displacement vector', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:knockback_resistance'], file).toMatchObject({ value: 1.0 })
      expect(components['minecraft:pushable'], file).toMatchObject({
        is_pushable: false,
        is_pushable_by_piston: false,
      })
      // the shulker recipe: a zeroed movement system anchors against passive drift
      expect(components['minecraft:movement'], file).toMatchObject({ value: 0 })
      expect(components['minecraft:water_movement'], file).toMatchObject({ drag_factor: 0.0 })
    }
  })

  it("declares no type family of this product's own — the family is the adventure build's", () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:type_family'], file).toBeUndefined()
    }
  })

  it('refuses damage from every cause', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:damage_sensor'], file).toMatchObject({ triggers: [{ deals_damage: 'no' }] })
      expect(components['minecraft:fire_immune'], file).toBeDefined()
    }
  })

  it('is summonable by identifier and reaches the creative menu through no spawn egg', () => {
    for (const { file, description } of behaviorEntities) {
      expect(description.is_summonable, file).toBe(true)
      expect(description.is_spawnable, file).toBe(false)
    }
  })

  it('cannot be renamed by a player: no component makes an actor nameable', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:nameable'], file).toBeUndefined()
    }
  })

  it('survives a restart and a chunk unload with no player near', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:persistent'], file).toBeDefined()
      expect(components['minecraft:despawn'], file).toBeUndefined()
    }
  })

  it('watches a nearby player continuously, and goes after nothing else', () => {
    for (const { file, components } of behaviorEntities) {
      expect(components['minecraft:behavior.look_at_player'], file).toMatchObject({ probability: 1.0 })
      const behaviors = Object.keys(components).filter((name) => name.startsWith('minecraft:behavior.'))
      expect(behaviors, file).toEqual(['minecraft:behavior.look_at_player'])
    }
  })
})

describe('every declared name is bare', () => {
  const kinds: [string, string, string][] = [
    ['resource_pack/animations', '.animation.json', 'animations'],
    ['resource_pack/animation_controllers', '.animation_controllers.json', 'animation_controllers'],
    ['resource_pack/render_controllers', '.render_controllers.json', 'render_controllers'],
  ]

  it('names no geometry under a namespace token', () => {
    for (const file of filesIn('resource_pack/models/entity', '.geo.json')) {
      const keys = Object.keys(readJson(file) as Record<string, unknown>).filter((key) => key.startsWith('geometry.'))
      expect(keys.length, file).toBeGreaterThan(0)
      for (const key of keys) {
        expect(key, file).toMatch(/^geometry\.[a-z0-9_]+$/)
      }
    }
  })

  it.each(kinds)('names no %s entry under a namespace token', (dir, suffix, key) => {
    for (const { file, names } of declaredNames(dir, suffix, key)) {
      expect(names.length, file).toBeGreaterThan(0)
      for (const name of names) {
        expect(name, file).not.toMatch(/(^|\.)rpg(\.|$)/)
      }
    }
  })
})

describe('a client entity resolves through this pack, the material excepted', () => {
  it('names only bare geometry, texture, animation, and render-controller spellings', () => {
    for (const { file, description } of clientEntities) {
      for (const geometry of Object.values(description.geometry ?? {})) {
        expect(geometry, file).toMatch(/^geometry\.[a-z0-9_]+$/)
      }
      for (const texture of Object.values(description.textures ?? {})) {
        expect(texture, file).toMatch(/^textures\/entity\/[a-z0-9_/]+$/)
        expect(existsSync(path.join(packRoot, 'resource_pack', `${texture}.png`)), texture).toBe(true)
      }
      for (const animation of Object.values(description.animations ?? {})) {
        expect(animation, file).toMatch(/^(controller\.animation|animation)\.[a-z0-9_.]+$/)
      }
      for (const controller of description.render_controllers ?? []) {
        expect(controller, file).toMatch(/^controller\.render\.[a-z0-9_.]+$/)
      }
    }
  })

  it('names the one stock material and no other vanilla name', () => {
    for (const { file, description } of clientEntities) {
      expect(Object.values(description.materials ?? {}), file).toEqual(['evoker'])
    }
  })

  it('carries no riding animation and no particle effect', () => {
    const sources = [
      ...filesIn('resource_pack/entity', '.entity.json'),
      ...filesIn('resource_pack/animation_controllers', '.animation_controllers.json'),
    ]
    for (const file of sources) {
      expect(readText(file), file).not.toMatch(/riding|particle_effect/i)
    }
  })
})

describe('the vendoring record', () => {
  const record = readFileSync(path.join(packageRoot, 'vendored-assets.yml'), 'utf8')

  it('names the source repository and the exact revision', () => {
    expect(record).toMatch(/^repository: \S+$/m)
    expect(record).toMatch(/^revision: \S+$/m)
  })

  it('pairs a source path with a committed path that exists', () => {
    const committed = [...record.matchAll(/^\s*committed:\s*(\S+)$/gm)].map((match) => match[1])
    expect(committed.length).toBeGreaterThan(0)
    for (const file of committed) {
      expect(existsSync(path.join(packRoot, file)), file).toBe(true)
    }
    expect([...record.matchAll(/^\s*- source:\s*(\S+)$/gm)]).toHaveLength(committed.length)
  })
})
