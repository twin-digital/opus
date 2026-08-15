import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PackKind } from '../types.js'
import { listFiles } from './build-outputs.js'
import { CLAIM_NAME_PREFIX, assetNamespace, claimName, packFamily } from './formats.js'
import { isRecord, messageOf, parseJson } from './json.js'
import type { VendoredPack } from './vendored-packs.js'

/** One of the package's own packs, as the merge reads it. */
export interface OwnPack {
  kind: PackKind
  /** the absolute source directory, `<packageDir>/behavior_pack` or `<packageDir>/resource_pack` */
  sourceDir: string
  /** the kind-named output directory, `behavior_pack` or `resource_pack` */
  outputBase: string
  /** the completed manifest's header uuid, which the asset namespace derives from */
  uuid: string
}

/** Options for {@link planMerge}. */
export interface MergePlanOptions {
  namespace: string
  packToken: string
  packs: OwnPack[]
  vendored: VendoredPack[]
}

/** What a namespaced build writes besides the manifests and the script bundle. */
export type MergePlan = Map<string, Buffer>

type Category =
  'entity' | 'geometry' | 'material' | 'render controller' | 'animation' | 'animation controller' | 'texture'

type ContentKind =
  | 'behavior-entity'
  | 'client-entity'
  | 'geometry'
  | 'material'
  | 'render-controller'
  | 'animation'
  | 'animation-controller'
  | 'lang'
  | 'texture'
  | 'skip'
  | 'opaque'
  | 'forbidden'

interface SourceHalf {
  /** `''` for the package's own pack; the vendored package's name otherwise */
  origin: string
  vendored: boolean
  kind: PackKind
  dir: string
}

interface SourceFile {
  half: SourceHalf
  /** absolute path, for error messages */
  file: string
  /** POSIX path relative to the half's directory */
  rel: string
  content: ContentKind
}

interface Declaration {
  category: Category
  /** the bare name, for collisions; asset spellings are keyed separately */
  name: string
  /** the spelling references use in source — `wizard`, `geometry.wizard`, `textures/entity/wizard` */
  spelling: string
  file: string
  origin: string
  kind: PackKind
}

/** Extensions that carry engine-readable names; a file of one the build cannot model fails. */
const NAME_BEARING_EXTENSIONS = new Set(['.json', '.material', '.lang', '.mcfunction'])

/** The modeled JSON content kinds, by the directory they live under. */
const JSON_DIRECTORIES = new Map<string, ContentKind>([
  ['entities', 'behavior-entity'],
  ['entity', 'client-entity'],
  ['models', 'geometry'],
  ['render_controllers', 'render-controller'],
  ['animations', 'animation'],
  ['animation_controllers', 'animation-controller'],
])

/**
 * Plans everything a namespaced build writes besides the manifests and the script bundle: the
 * package's own pack content and every vendored half, each declared name rewritten — entity
 * identifiers and their localization keys under the namespace, every other declared name under
 * the built pack's asset namespace — references to undeclared names copied as written, `.lang`
 * files composed across the merged packs, and the claim entity type added to the behavior half.
 *
 * Every fault is collected before anything is returned, and one error names them all: content of
 * a kind the build cannot rewrite, a source name already carrying a namespace, a bare name landing
 * in the reserved claim spelling, a name declared by more than one of the merged packs, and a
 * file more than one pack contributes that the build cannot compose.
 */
export async function planMerge(options: MergePlanOptions): Promise<MergePlan> {
  const errors: string[] = []
  const halves = sourceHalves(options)
  const outputBase = new Map(options.packs.map((pack) => [pack.kind, pack.outputBase]))
  const assetToken = new Map(options.packs.map((pack) => [pack.kind, assetNamespace(pack.uuid)]))

  const files: SourceFile[] = []
  for (const half of halves) {
    for (const file of await listFiles(half.dir)) {
      const rel = path.relative(half.dir, file).split(path.sep).join('/')
      const content = classify(rel, half.vendored)
      if (content === 'skip') {
        continue
      }
      if (content === 'forbidden') {
        errors.push(
          half.vendored ?
            `${file}: a vendored pack may not hold content of this kind`
          : `${file}: the build cannot rewrite the names this kind of content may carry; remove it or leave namespacing off`,
        )
        continue
      }
      files.push({ half, file, rel, content })
    }
  }

  const texts = new Map<string, string>()
  for (const source of files) {
    if (source.content !== 'texture' && source.content !== 'opaque') {
      texts.set(source.file, await readFile(source.file, 'utf8'))
    }
  }

  const declarations = scanDeclarations(files, texts, errors)
  checkCollisions(declarations, errors)
  checkReserved(declarations, errors)

  const entityMap = new Map<string, string>()
  const assetMaps = new Map<PackKind, Map<string, string>>([
    ['behavior', new Map()],
    ['resource', new Map()],
  ])
  for (const declaration of declarations) {
    if (declaration.category === 'entity') {
      entityMap.set(declaration.spelling, `${options.namespace}:${declaration.spelling}`)
    } else {
      const token = assetToken.get(declaration.kind) as string
      assetMaps.get(declaration.kind)?.set(declaration.spelling, assetSpelling(declaration, token))
    }
  }

  if (errors.length > 0) {
    throw mergeError(errors)
  }

  const plan: MergePlan = new Map()
  const writers = new Map<string, { origin: string; file: string }>()
  const langContributions = new Map<string, { origin: string; text: string }[]>()
  const family = packFamily(options.packToken)

  const emit = (source: SourceFile, rel: string, contents: Buffer): void => {
    const target = `${outputBase.get(source.half.kind) as string}/${rel}`
    const existing = writers.get(target)
    if (existing !== undefined) {
      errors.push(
        `${target} is contributed by both ${existing.file} (${originLabel(existing.origin)}) and ${source.file} (${originLabel(source.half.origin)}), and the build cannot compose it`,
      )
      return
    }
    writers.set(target, { origin: source.half.origin, file: source.file })
    plan.set(target, contents)
  }

  for (const source of files) {
    const assets = assetMaps.get(source.half.kind) as Map<string, string>
    switch (source.content) {
      case 'texture': {
        const token = assetToken.get(source.half.kind) as string
        const under = source.rel.slice('textures/'.length)
        emit(source, `textures/${token}/${under}`, await readFile(source.file))
        break
      }
      case 'opaque': {
        emit(source, source.rel, await readFile(source.file))
        break
      }
      case 'lang': {
        const target = `${outputBase.get(source.half.kind) as string}/${source.rel}`
        const rewritten = rewriteLang(source, texts.get(source.file) as string, entityMap, errors)
        const contributions = langContributions.get(target) ?? []
        contributions.push({ origin: source.half.origin, text: rewritten })
        langContributions.set(target, contributions)
        break
      }
      default: {
        const text = texts.get(source.file) as string
        const rewritten = rewriteJson(source, text, entityMap, assets, family, errors)
        if (rewritten !== undefined) {
          emit(source, source.rel, rewritten)
        }
      }
    }
  }

  if (errors.length > 0) {
    throw mergeError(errors)
  }

  for (const [target, contributions] of langContributions) {
    contributions.sort((a, b) => a.origin.localeCompare(b.origin))
    const composed = contributions.map((entry) => entry.text.replace(/\n+$/u, '')).join('\n')
    plan.set(target, Buffer.from(`${composed}\n`))
  }

  const behavior = options.packs.find((pack) => pack.kind === 'behavior')
  if (behavior !== undefined) {
    const name = claimName(options.packToken)
    const target = `${behavior.outputBase}/entities/${name}.json`
    const taken = writers.get(target)
    if (taken !== undefined) {
      throw mergeError([`${target} is where the build writes its claim type, but ${taken.file} already sits there`])
    }
    plan.set(target, serializeJson(claimEntity(`${options.namespace}:${name}`, family)))
  }

  return plan
}

/** The halves the merge reads: the package's own packs, then every vendored half. */
function sourceHalves(options: MergePlanOptions): SourceHalf[] {
  const halves: SourceHalf[] = options.packs.map((pack) => ({
    origin: '',
    vendored: false,
    kind: pack.kind,
    dir: pack.sourceDir,
  }))
  for (const pack of options.vendored) {
    for (const half of pack.halves) {
      halves.push({ origin: pack.name, vendored: true, kind: half.kind, dir: half.dir })
    }
  }
  return halves
}

/**
 * What a file is to the build, from its place in the pack. A vendored tree may hold only the
 * modeled kinds; in the package's own pack, an unmodeled file of a name-bearing extension fails
 * and anything else copies unchanged.
 */
function classify(rel: string, vendored: boolean): ContentKind {
  const head = rel.split('/')[0]
  if (rel === 'manifest.json' || head === 'scripts') {
    return vendored ? 'forbidden' : 'skip'
  }
  if (head === 'textures' && rel.includes('/')) {
    return 'texture'
  }
  if (rel.endsWith('.json')) {
    const kind = JSON_DIRECTORIES.get(head)
    if (kind !== undefined) {
      return kind
    }
  }
  if (head === 'materials' && rel.endsWith('.material')) {
    return 'material'
  }
  if (head === 'texts' && rel.endsWith('.lang')) {
    return 'lang'
  }
  if (vendored) {
    return 'forbidden'
  }
  return NAME_BEARING_EXTENSIONS.has(path.posix.extname(rel)) ? 'forbidden' : 'opaque'
}

/** Every name the merged packs declare, with the faults scanning them found. */
function scanDeclarations(files: SourceFile[], texts: Map<string, string>, errors: string[]): Declaration[] {
  const declarations: Declaration[] = []

  const declare = (source: SourceFile, category: Category, spelling: string, name: string): void => {
    declarations.push({
      category,
      name,
      spelling,
      file: source.file,
      origin: source.half.origin,
      kind: source.half.kind,
    })
  }

  for (const source of files) {
    const text = texts.get(source.file)
    if (text === undefined || source.content === 'lang') {
      continue
    }
    const parsed = readJsonContent(source, text, errors)
    if (parsed === undefined) {
      continue
    }

    const declarePrefixedKeys = (value: unknown, field: string, prefix: string, category: Category): void => {
      if (!isRecord(value) || !isRecord(value[field])) {
        errors.push(`${source.file}: not a ${category} file the build can rewrite`)
        return
      }
      for (const key of Object.keys(value[field])) {
        if (!key.startsWith(prefix) || key.includes(':')) {
          errors.push(`${source.file}: ${key} is not a bare ${category} name the build can rewrite`)
        } else {
          declare(source, category, key, key.slice(prefix.length))
        }
      }
    }

    switch (source.content) {
      case 'behavior-entity': {
        const identifier = entityIdentifier(parsed, 'minecraft:entity')
        if (typeof identifier !== 'string') {
          errors.push(`${source.file}: not a behavior entity definition the build can rewrite`)
        } else if (identifier.includes(':')) {
          errors.push(`${source.file}: ${identifier} already carries a namespace — write the bare name`)
        } else {
          declare(source, 'entity', identifier, identifier)
        }
        break
      }
      case 'client-entity': {
        const identifier = entityIdentifier(parsed, 'minecraft:client_entity')
        if (typeof identifier !== 'string') {
          errors.push(`${source.file}: not a client entity definition the build can rewrite`)
        } else if (!identifier.includes(':')) {
          declare(source, 'entity', identifier, identifier)
        }
        break
      }
      case 'geometry': {
        for (const spelling of geometryIdentifiers(parsed)) {
          if (!spelling.startsWith('geometry.') || spelling.includes(':')) {
            errors.push(`${source.file}: ${spelling} is not a bare geometry identifier the build can rewrite`)
          } else {
            declare(source, 'geometry', spelling, spelling.slice('geometry.'.length))
          }
        }
        break
      }
      case 'material': {
        for (const key of materialKeys(parsed)) {
          const name = key.split(':')[0]
          declare(source, 'material', name, name)
        }
        break
      }
      case 'render-controller': {
        declarePrefixedKeys(parsed, 'render_controllers', 'controller.render.', 'render controller')
        break
      }
      case 'animation': {
        declarePrefixedKeys(parsed, 'animations', 'animation.', 'animation')
        break
      }
      case 'animation-controller': {
        declarePrefixedKeys(parsed, 'animation_controllers', 'controller.animation.', 'animation controller')
        break
      }
      default:
        break
    }
  }

  for (const source of files) {
    if (source.content === 'texture') {
      const spelling = source.rel.replace(/\.[^./]+$/u, '')
      declare(source, 'texture', spelling, spelling)
    }
  }

  return declarations
}

/** A name declared by more than one of the merged packs fails, naming every declaration. */
function checkCollisions(declarations: Declaration[], errors: string[]): void {
  const groups = new Map<string, Declaration[]>()
  for (const declaration of declarations) {
    // entity identifiers are pack-wide; asset names live within their half
    const key =
      declaration.category === 'entity' ?
        `entity:${declaration.name}`
      : `${declaration.kind}:${declaration.category}:${declaration.name}`
    const group = groups.get(key) ?? []
    group.push(declaration)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const origins = new Set(group.map((declaration) => declaration.origin))
    if (origins.size > 1) {
      const claimants = group
        .map((declaration) => `${declaration.file} (${originLabel(declaration.origin)})`)
        .join(' and ')
      errors.push(`the ${group[0].category} name ${group[0].name} is declared by ${claimants}`)
    }
  }
}

/** A bare entity name landing in the claim spelling is reserved for the build's own claim type. */
function checkReserved(declarations: Declaration[], errors: string[]): void {
  for (const declaration of declarations) {
    if (declaration.category === 'entity' && declaration.name.startsWith(CLAIM_NAME_PREFIX)) {
      errors.push(
        `${declaration.file}: ${declaration.name} lands in the reserved ${CLAIM_NAME_PREFIX} names the build claims for itself`,
      )
    }
  }
}

/** The rewritten spelling of a non-entity declaration: the asset namespace written into the name. */
function assetSpelling(declaration: Declaration, assetToken: string): string {
  switch (declaration.category) {
    case 'geometry':
      return `geometry.${assetToken}.${declaration.name}`
    case 'material':
      return `${assetToken}_${declaration.name}`
    case 'render controller':
      return `controller.render.${assetToken}.${declaration.name}`
    case 'animation':
      return `animation.${assetToken}.${declaration.name}`
    case 'animation controller':
      return `controller.animation.${assetToken}.${declaration.name}`
    case 'texture':
      return `textures/${assetToken}/${declaration.name.slice('textures/'.length)}`
    default:
      return declaration.name
  }
}

/**
 * Rewrites one modeled JSON file; `undefined` after a fault was recorded. A file the rewrite left
 * untouched keeps its source bytes, so it reaches the output unchanged.
 */
function rewriteJson(
  source: SourceFile,
  text: string,
  entityMap: Map<string, string>,
  assets: Map<string, string>,
  family: string,
  errors: string[],
): Buffer | undefined {
  const parsed = readJsonContent(source, text, errors)
  if (parsed === undefined) {
    return undefined
  }
  if (!isRecord(parsed)) {
    errors.push(`${source.file}: not a definition file the build can rewrite`)
    return undefined
  }
  const before = JSON.stringify(parsed)

  switch (source.content) {
    case 'behavior-entity':
      rewriteBehaviorEntity(parsed, entityMap, assets, family)
      break
    case 'client-entity':
      rewriteClientEntity(parsed, entityMap, assets)
      break
    case 'geometry':
      rewriteGeometry(parsed, assets)
      break
    case 'material':
      rewriteMaterial(parsed, assets)
      break
    case 'render-controller':
      renameKeys(parsed, 'render_controllers', assets)
      break
    case 'animation':
      renameKeys(parsed, 'animations', assets)
      break
    case 'animation-controller':
      renameKeys(parsed, 'animation_controllers', assets)
      break
    default:
      break
  }
  return JSON.stringify(parsed) === before ? Buffer.from(text) : serializeJson(parsed)
}

function rewriteBehaviorEntity(
  parsed: Record<string, unknown>,
  entityMap: Map<string, string>,
  assets: Map<string, string>,
  family: string,
): void {
  const entity = parsed['minecraft:entity']
  if (!isRecord(entity)) {
    return
  }
  const description = entity.description
  if (isRecord(description)) {
    if (typeof description.identifier === 'string') {
      description.identifier = entityMap.get(description.identifier) ?? description.identifier
    }
    rewriteRecordValues(description.animations, assets)
  }
  stampFamily(entity, family)
}

function rewriteClientEntity(
  parsed: Record<string, unknown>,
  entityMap: Map<string, string>,
  assets: Map<string, string>,
): void {
  const entity = parsed['minecraft:client_entity']
  if (!isRecord(entity) || !isRecord(entity.description)) {
    return
  }
  const description = entity.description

  if (typeof description.identifier === 'string' && !description.identifier.includes(':')) {
    description.identifier = entityMap.get(description.identifier) ?? description.identifier
  }
  rewriteRecordValues(description.geometry, assets)
  rewriteRecordValues(description.textures, assets)
  rewriteRecordValues(description.materials, assets)
  rewriteRecordValues(description.animations, assets)

  if (Array.isArray(description.render_controllers)) {
    description.render_controllers = description.render_controllers.map((entry) => {
      if (typeof entry === 'string') {
        return assets.get(entry) ?? entry
      }
      if (isRecord(entry)) {
        return Object.fromEntries(Object.entries(entry).map(([key, value]) => [assets.get(key) ?? key, value]))
      }
      return entry as unknown
    })
  }
}

function rewriteGeometry(parsed: Record<string, unknown>, assets: Map<string, string>): void {
  const modern = parsed['minecraft:geometry']
  if (Array.isArray(modern)) {
    for (const entry of modern) {
      if (isRecord(entry) && isRecord(entry.description) && typeof entry.description.identifier === 'string') {
        entry.description.identifier = assets.get(entry.description.identifier) ?? entry.description.identifier
      }
    }
  }
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('geometry.')) {
      const renamed = assets.get(key)
      if (renamed !== undefined) {
        parsed[renamed] = parsed[key]
        Reflect.deleteProperty(parsed, key)
      }
    }
  }
}

function rewriteMaterial(parsed: Record<string, unknown>, assets: Map<string, string>): void {
  if (!isRecord(parsed.materials)) {
    return
  }
  parsed.materials = Object.fromEntries(
    Object.entries(parsed.materials).map(([key, value]) => {
      if (key === 'version') {
        return [key, value]
      }
      const parts = key.split(':')
      const renamed = assets.get(parts[0]) ?? parts[0]
      if (parts.length === 1) {
        return [renamed, value]
      }
      return [`${renamed}:${assets.get(parts[1]) ?? parts[1]}`, value]
    }),
  )
}

function renameKeys(parsed: Record<string, unknown>, field: string, assets: Map<string, string>): void {
  const record = parsed[field]
  if (!isRecord(record)) {
    return
  }
  parsed[field] = Object.fromEntries(Object.entries(record).map(([key, value]) => [assets.get(key) ?? key, value]))
}

/** Rewrites the string values of a reference map — geometry, textures, materials, animations. */
function rewriteRecordValues(value: unknown, assets: Map<string, string>): void {
  if (!isRecord(value)) {
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      value[key] = assets.get(entry) ?? entry
    }
  }
}

/**
 * Writes the pack family into every `minecraft:type_family` the definition carries — the base
 * components and any component group's — and creates the base component where none exists, so the
 * family reads back whichever groups are active.
 */
function stampFamily(entity: Record<string, unknown>, family: string): void {
  const stampInto = (components: unknown): boolean => {
    if (!isRecord(components)) {
      return false
    }
    const component = components['minecraft:type_family']
    if (!isRecord(component)) {
      return false
    }
    const list = Array.isArray(component.family) ? component.family : []
    if (!list.includes(family)) {
      list.push(family)
    }
    component.family = list
    return true
  }

  let stamped = stampInto(entity.components)
  if (isRecord(entity.component_groups)) {
    for (const group of Object.values(entity.component_groups)) {
      stamped = stampInto(group) || stamped
    }
  }

  if (!stamped) {
    const components = isRecord(entity.components) ? entity.components : {}
    components['minecraft:type_family'] = { family: [family] }
    entity.components = components
  }
}

const LANG_ENTITY_KEY = /^(entity\.|item\.spawn_egg\.entity\.)(.+)(\.name)$/u

/** Rewrites a `.lang` file's entity-keyed entries; in a vendored tree any other entry faults. */
function rewriteLang(source: SourceFile, text: string, entityMap: Map<string, string>, errors: string[]): string {
  const lines = text.split('\n').map((line) => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      return line
    }
    const key = line.includes('=') ? line.slice(0, line.indexOf('=')) : line
    const match = LANG_ENTITY_KEY.exec(key.trim())
    if (match === null) {
      if (source.half.vendored) {
        errors.push(`${source.file}: ${key.trim()} is not a localization entry keyed by an entity identifier`)
      }
      return line
    }
    const rewritten = entityMap.get(match[2])
    return rewritten === undefined ? line : line.replace(key.trim(), `${match[1]}${rewritten}${match[3]}`)
  })
  return lines.join('\n')
}

/** The claim entity type: unspawnable, and carrying the pack's own family. */
function claimEntity(identifier: string, family: string): Record<string, unknown> {
  return {
    format_version: '1.16.0',
    'minecraft:entity': {
      description: { identifier, is_spawnable: false, is_summonable: false },
      components: { 'minecraft:type_family': { family: [family] } },
    },
  }
}

function entityIdentifier(parsed: unknown, root: string): unknown {
  if (!isRecord(parsed)) {
    return undefined
  }
  const entity = parsed[root]
  if (!isRecord(entity)) {
    return undefined
  }
  const description = entity.description
  return isRecord(description) ? description.identifier : undefined
}

function geometryIdentifiers(parsed: unknown): string[] {
  if (!isRecord(parsed)) {
    return []
  }
  const identifiers: string[] = []
  const modern = parsed['minecraft:geometry']
  if (Array.isArray(modern)) {
    for (const entry of modern) {
      if (isRecord(entry) && isRecord(entry.description) && typeof entry.description.identifier === 'string') {
        identifiers.push(entry.description.identifier)
      }
    }
  }
  identifiers.push(...Object.keys(parsed).filter((key) => key.startsWith('geometry.')))
  return identifiers
}

function materialKeys(parsed: unknown): string[] {
  if (!isRecord(parsed) || !isRecord(parsed.materials)) {
    return []
  }
  return Object.keys(parsed.materials).filter((key) => key !== 'version')
}

function readJsonContent(source: SourceFile, text: string, errors: string[]): unknown {
  try {
    return parseJson(text)
  } catch (error) {
    errors.push(`${source.file}: ${messageOf(error)}`)
    return undefined
  }
}

function serializeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function originLabel(origin: string): string {
  return origin === '' ? "the package's own pack" : `vendored from ${origin}`
}

function mergeError(errors: string[]): Error {
  return new Error(`the namespaced build cannot proceed:\n${errors.map((line) => `  ${line}`).join('\n')}`)
}
