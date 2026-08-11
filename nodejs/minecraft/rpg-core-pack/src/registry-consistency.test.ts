/**
 * Ties the committed entity definitions to the library's preset registry (the identifier source)
 * and to the namespace every declared name must carry. Definition generation from the registry is
 * deferred to the dev kit; until then this test is what keeps the two packages from disagreeing.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { NAMESPACE, PRESET_NAMES, PRESETS } from '@twin-digital/rpg-core'
import { describe, expect, it } from 'vitest'

interface BehaviorEntityFile {
  'minecraft:entity': {
    description: { identifier: string }
    components: Record<string, unknown>
  }
}

interface ClientEntityDescription {
  identifier: string
  geometry?: Record<string, string>
  textures?: Record<string, string>
  animations?: Record<string, string>
  render_controllers?: string[]
}

interface ClientEntityFile {
  'minecraft:client_entity': { description: ClientEntityDescription }
}

const packageRoot = path.join(new URL('.', import.meta.url).pathname, '..')

const readJson = (relative: string): unknown => JSON.parse(readFileSync(path.join(packageRoot, relative), 'utf8'))

const filesIn = (relativeDir: string, suffix: string): string[] =>
  readdirSync(path.join(packageRoot, relativeDir))
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(relativeDir, name))

const behaviorEntities = filesIn('behavior_pack/entities', '.json').map((file) => {
  const entity = (readJson(file) as BehaviorEntityFile)['minecraft:entity']
  return { file, identifier: entity.description.identifier, components: entity.components }
})

const clientEntities = filesIn('resource_pack/entity', '.entity.json').map((file) => ({
  file,
  description: (readJson(file) as ClientEntityFile)['minecraft:client_entity'].description,
}))

const registryIds: string[] = PRESET_NAMES.map((name) => PRESETS[name].entityId)

describe('preset registry consistency', () => {
  it('gives every preset a behavior entity definition under its entityId', () => {
    for (const id of registryIds) {
      expect(behaviorEntities.map((e) => e.identifier)).toContain(id)
    }
  })

  it('gives every preset a client entity definition under its entityId', () => {
    for (const id of registryIds) {
      expect(clientEntities.map((e) => e.description.identifier)).toContain(id)
    }
  })

  it('commits no entity definition the registry does not claim', () => {
    for (const { file, identifier } of behaviorEntities) {
      expect(registryIds, file).toContain(identifier)
    }
    for (const { file, description } of clientEntities) {
      expect(registryIds, file).toContain(description.identifier)
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
})

describe('every declared name carries the namespace', () => {
  it('prefixes every geometry identifier', () => {
    for (const file of filesIn('resource_pack/models/entity', '.geo.json')) {
      const keys = Object.keys(readJson(file) as Record<string, unknown>).filter((key) => key.startsWith('geometry.'))
      expect(keys.length, file).toBeGreaterThan(0)
      for (const key of keys) {
        expect(key, file).toMatch(new RegExp(`^geometry\\.${NAMESPACE}\\.`))
      }
    }
  })

  it('prefixes every animation identifier', () => {
    for (const file of filesIn('resource_pack/animations', '.animation.json')) {
      for (const key of Object.keys((readJson(file) as { animations: Record<string, unknown> }).animations)) {
        expect(key, file).toMatch(new RegExp(`^animation\\.${NAMESPACE}\\.`))
      }
    }
  })

  it('prefixes every animation controller identifier', () => {
    for (const file of filesIn('resource_pack/animation_controllers', '.animation_controllers.json')) {
      const declared = (readJson(file) as { animation_controllers: Record<string, unknown> }).animation_controllers
      for (const key of Object.keys(declared)) {
        expect(key, file).toMatch(new RegExp(`^controller\\.animation\\.${NAMESPACE}\\.`))
      }
    }
  })

  it('prefixes every render controller identifier', () => {
    for (const file of filesIn('resource_pack/render_controllers', '.render_controllers.json')) {
      const declared = (readJson(file) as { render_controllers: Record<string, unknown> }).render_controllers
      for (const key of Object.keys(declared)) {
        expect(key, file).toMatch(new RegExp(`^controller\\.render\\.${NAMESPACE}\\.`))
      }
    }
  })

  it('resolves each client entity through namespaced names only, the material excepted', () => {
    for (const { file, description } of clientEntities) {
      for (const geometry of Object.values(description.geometry ?? {})) {
        expect(geometry, file).toMatch(new RegExp(`^geometry\\.${NAMESPACE}\\.`))
      }
      for (const texture of Object.values(description.textures ?? {})) {
        expect(texture, file).toMatch(new RegExp(`^textures/entity/${NAMESPACE}/`))
      }
      for (const animation of Object.values(description.animations ?? {})) {
        expect(animation, file).toMatch(new RegExp(`^(controller\\.animation|animation)\\.${NAMESPACE}\\.`))
      }
      for (const controller of description.render_controllers ?? []) {
        expect(controller, file).toMatch(new RegExp(`^controller\\.render\\.${NAMESPACE}\\.`))
      }
    }
  })
})
