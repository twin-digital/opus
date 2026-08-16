import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PackKind } from '../types.js'
import { listFiles } from './build-outputs.js'
import { CLAIM_NAME_PREFIX, VENDORED_HASH_LENGTH, claimName, packFamily, vendoredAssetToken } from './formats.js'
import { isRecord, messageOf, parseJson } from './json.js'
import type { VendoredPack } from './vendored-packs.js'

/** One of the package's own packs, as the merge reads it. */
export interface OwnPack {
  kind: PackKind
  /** the absolute source directory, `<packageDir>/behavior_pack` or `<packageDir>/resource_pack` */
  sourceDir: string
  /** the kind-named output directory, `behavior_pack` or `resource_pack` */
  outputBase: string
}

/** Options for {@link planMerge}. */
export interface MergePlanOptions {
  namespace: string
  packToken: string
  packs: OwnPack[]
  /** the vendored packs that merge, each carrying its entity prefix */
  vendored: VendoredPack[]
  /** vendored packs the dependency walk reaches that nothing admitted — read for diagnosis only */
  unmerged: VendoredPack[]
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
  /** the vendored pack's entity prefix; `''` for the package's own pack */
  prefix: string
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
 * package's own pack content and every vendored half, each declared name rewritten — the
 * package's own entity identifiers as `<ns>:<name>` and a vendored pack's as
 * `<ns>:<prefix>.<name>`, localization keys following the final ids, the pack's own asset names
 * under the namespace as their token, and every vendored asset's name under its library's token
 * plus a content hash — references to undeclared names copied as written, `.lang` files composed
 * across the merged packs, and the claim entity type added to the behavior half.
 *
 * A reference resolves against the pack that wrote it first; the consumer's own content also
 * reaches a vendored entity or asset by its prefixed spelling. In own content, bare means yours
 * or vanilla: a bare reference a merged pack declares never binds and fails printing the
 * qualified spellings. Vendored content, which has no qualifier to write, keeps the
 * unique-merged-declarer fallback, with several declarers ambiguous. On both paths, a name only
 * an unmerged supplier declares fails naming the supplier and the fix, and a name nothing
 * reachable declares copies as written.
 *
 * Every fault is collected before anything is returned, and one error names them all: content of
 * a kind the build cannot rewrite, a source name already carrying a namespace, a dotted bare
 * entity name, a bare name landing in the reserved claim spelling, an ambiguous or dangling
 * reference, and a file more than one pack contributes that the build cannot compose.
 */
export async function planMerge(options: MergePlanOptions): Promise<MergePlan> {
  const errors: string[] = []
  const halves = sourceHalves(options)
  const outputBase = new Map(options.packs.map((pack) => [pack.kind, pack.outputBase]))
  const libraryTokens = new Map(options.vendored.map((pack) => [pack.name, pack.token]))

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
  const bytes = new Map<string, Buffer>()
  for (const source of files) {
    if (source.content === 'texture') {
      bytes.set(source.file, await readFile(source.file))
    } else if (source.content !== 'opaque') {
      texts.set(source.file, await readFile(source.file, 'utf8'))
    }
  }

  const declarations = scanDeclarations(files, texts, errors)
  checkVendoredDuplicates(declarations, errors)
  checkReserved(declarations, errors)
  checkPrefixShadowing(declarations, new Map(options.vendored.map((pack) => [pack.prefix, pack.name])), errors)

  const diagnosis = await scanUnmergedDeclarations(options.unmerged)
  const entities = entityNames(options, declarations, diagnosis, errors)
  const names = assetNames({ options, files, declarations, texts, bytes, libraryTokens, diagnosis, errors })

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
    switch (source.content) {
      case 'texture': {
        const under = source.rel.slice('textures/'.length)
        emit(source, `textures/${names.tokenFor(source)}/${under}`, bytes.get(source.file) as Buffer)
        break
      }
      case 'opaque': {
        emit(source, source.rel, await readFile(source.file))
        break
      }
      case 'lang': {
        const target = `${outputBase.get(source.half.kind) as string}/${source.rel}`
        const rewritten = rewriteLang(source, texts.get(source.file) as string, entities.resolverFor(source), errors)
        const contributions = langContributions.get(target) ?? []
        contributions.push({ origin: source.half.origin, text: rewritten })
        langContributions.set(target, contributions)
        break
      }
      default: {
        const text = texts.get(source.file) as string
        const rewritten = rewriteJson(
          source,
          text,
          entities.resolverFor(source),
          names.resolverFor(source),
          family,
          errors,
        )
        if (rewritten !== undefined) {
          // a vendored definition file's basename carries its library token, so two merged packs
          // shipping one relative path — models/minion.geo.json, say — land side by side
          const target =
            source.half.vendored ?
              prefixedBasename(source.rel, libraryTokens.get(source.half.origin) ?? source.half.origin)
            : source.rel
          emit(source, target, rewritten)
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
    prefix: '',
    kind: pack.kind,
    dir: pack.sourceDir,
  }))
  for (const pack of options.vendored) {
    for (const half of pack.halves) {
      halves.push({ origin: pack.name, vendored: true, prefix: pack.prefix, kind: half.kind, dir: half.dir })
    }
  }
  return halves
}

/** The unmerged packs' halves, read for diagnosis only. */
function unmergedHalves(unmerged: VendoredPack[]): SourceHalf[] {
  return unmerged.flatMap((pack) =>
    pack.halves.map((half) => ({
      origin: pack.name,
      vendored: true,
      prefix: pack.prefix,
      kind: half.kind,
      dir: half.dir,
    })),
  )
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
        } else if (identifier.includes('.')) {
          errors.push(`${source.file}: ${identifier} carries a dot, which the build reserves as the prefix separator`)
        } else {
          declare(source, 'entity', identifier, identifier)
        }
        break
      }
      case 'client-entity': {
        const identifier = entityIdentifier(parsed, 'minecraft:client_entity')
        if (typeof identifier !== 'string') {
          errors.push(`${source.file}: not a client entity definition the build can rewrite`)
        } else if (identifier.includes(':')) {
          break // a reference to another pack's or vanilla's entity, copied as written
        } else if (identifier.includes('.')) {
          // the consumer's composed reference to a vendored entity, resolved at rewrite; a
          // vendored pack cannot spell consumer prefixes, so a dotted name there is a fault
          if (source.half.vendored) {
            errors.push(`${source.file}: ${identifier} carries a dot, which the build reserves as the prefix separator`)
          }
        } else {
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

/** What the unmerged, walk-reachable vendored packs declare — read for diagnosis only. */
interface UnmergedDeclarations {
  /** composed spelling — the pack's default prefix, a dot, the bare name — to its declaration */
  entities: Map<string, { origin: string; file: string }>
  /** `<kind> <spelling>` to the declaring unmerged pack */
  assets: Map<string, { origin: string; file: string }>
}

/**
 * Scans the unmerged packs' trees for what they declare, so a dangling reference can name its
 * supplier and the fix. Their content faults are not this build's to report: forbidden files are
 * skipped and scan errors dropped.
 */
async function scanUnmergedDeclarations(unmerged: VendoredPack[]): Promise<UnmergedDeclarations> {
  const entities = new Map<string, { origin: string; file: string }>()
  const assets = new Map<string, { origin: string; file: string }>()
  const prefixes = new Map(unmerged.map((pack) => [pack.name, pack.prefix]))

  const files: SourceFile[] = []
  for (const half of unmergedHalves(unmerged)) {
    for (const file of await listFiles(half.dir)) {
      const rel = path.relative(half.dir, file).split(path.sep).join('/')
      const content = classify(rel, true)
      if (content !== 'forbidden' && content !== 'skip') {
        files.push({ half, file, rel, content })
      }
    }
  }

  const texts = new Map<string, string>()
  for (const source of files) {
    if (source.content !== 'texture' && source.content !== 'opaque') {
      texts.set(source.file, await readFile(source.file, 'utf8'))
    }
  }

  const dropped: string[] = []
  for (const declaration of scanDeclarations(files, texts, dropped)) {
    const entry = { origin: declaration.origin, file: declaration.file }
    if (declaration.category === 'entity') {
      const prefix = prefixes.get(declaration.origin)
      if (prefix !== undefined && !entities.has(`${prefix}.${declaration.name}`)) {
        entities.set(`${prefix}.${declaration.name}`, entry)
      }
    } else if (!assets.has(`${declaration.kind} ${declaration.spelling}`)) {
      assets.set(`${declaration.kind} ${declaration.spelling}`, entry)
    }
  }

  return { entities, assets }
}

/** The failure a reference gets when only a pack nothing admitted declares its name. */
function danglingMessage(file: string, name: string, supplier: { origin: string; file: string }): string {
  return `${file}: ${name} resolves to no merged declaration, but ${supplier.origin} declares it in ${supplier.file}: add ${supplier.origin} to dependencies or the vendor block`
}

/** The entity-name machinery: per-scope final ids, and the resolver a file's rewrites use. */
interface EntityNames {
  /** a resolver bound to one file: a spelling to its final id, or `undefined` to copy */
  resolverFor(source: SourceFile): (spelling: string) => string | undefined
}

/**
 * Builds the entity-name machinery. The package's own entities build as `<ns>:<name>`; a vendored
 * pack's entities as `<ns>:<prefix>.<name>`, the prefix being the per-dependency token the
 * consumer chose — so no two merged packs' final ids can contend, and the bare halves stay
 * dot-free by the scan's rule.
 *
 * A spelling resolves against the scope that wrote it first: a bare name is the writing pack's
 * own entity. The consumer's own content may also spell `prefix.name`, which resolves to the
 * named dependency's entity — a prefix that matches a merged dependency declaring no such entity
 * fails naming both halves, a spelling only an unmerged supplier declares fails naming the
 * supplier and the fix, and anything else copies as written.
 */
function entityNames(
  options: MergePlanOptions,
  declarations: Declaration[],
  diagnosis: UnmergedDeclarations,
  errors: string[],
): EntityNames {
  const prefixByOrigin = new Map(options.vendored.map((pack) => [pack.name, pack.prefix]))
  const originByPrefix = new Map(options.vendored.map((pack) => [pack.prefix, pack.name]))

  const scopes = new Map<string, Map<string, string>>()
  for (const declaration of declarations) {
    if (declaration.category !== 'entity') {
      continue
    }
    const prefix = declaration.origin === '' ? undefined : prefixByOrigin.get(declaration.origin)
    const final =
      prefix === undefined ?
        `${options.namespace}:${declaration.name}`
      : `${options.namespace}:${prefix}.${declaration.name}`
    const scope = scopes.get(declaration.origin) ?? new Map<string, string>()
    scope.set(declaration.name, final)
    scopes.set(declaration.origin, scope)
  }

  return {
    resolverFor: (source) => (spelling) => {
      if (spelling.includes(':')) {
        return undefined
      }
      const direct = scopes.get(source.half.origin)?.get(spelling)
      if (direct !== undefined) {
        return direct
      }
      const dot = spelling.indexOf('.')
      if (dot === -1 || source.half.origin !== '') {
        return undefined
      }
      const prefix = spelling.slice(0, dot)
      const rest = spelling.slice(dot + 1)
      const target = originByPrefix.get(prefix)
      if (target !== undefined) {
        const final = scopes.get(target)?.get(rest)
        if (final !== undefined) {
          return final
        }
        errors.push(`${source.file}: ${spelling} carries the prefix of ${target}, which declares no entity ${rest}`)
        return undefined
      }
      const supplier = diagnosis.entities.get(spelling)
      if (supplier !== undefined) {
        errors.push(danglingMessage(source.file, spelling, supplier))
      }
      return undefined
    },
  }
}

/**
 * Within one vendored pack, an asset name declared by two files has two content hashes and so two
 * final names, which no reference could pick between — it fails naming both files. The consuming
 * package's own duplicates keep today's behavior: one token, one final name, the engine's pick.
 */
function checkVendoredDuplicates(declarations: Declaration[], errors: string[]): void {
  const groups = new Map<string, Declaration[]>()
  for (const declaration of declarations) {
    if (declaration.category === 'entity' || declaration.origin === '') {
      continue
    }
    const key = `${declaration.origin} ${declaration.kind} ${declaration.category} ${declaration.spelling}`
    const group = groups.get(key) ?? []
    group.push(declaration)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const files = new Set(group.map((declaration) => declaration.file))
    if (files.size > 1) {
      errors.push(
        `the ${group[0].category} name ${group[0].name} is declared by more than one file of ${group[0].origin}: ${[...files].sort().join(' and ')}`,
      )
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

/** What {@link assetNames} works from. */
interface AssetNamesInputs {
  options: MergePlanOptions
  files: SourceFile[]
  declarations: Declaration[]
  texts: Map<string, string>
  bytes: Map<string, Buffer>
  /** vendored package name to package token */
  libraryTokens: Map<string, string>
  /** what the unmerged packs declare, so a dangling reference names its supplier */
  diagnosis: UnmergedDeclarations
  errors: string[]
}

/** The final-name and resolution machinery for asset names. */
interface AssetNames {
  /** the final spelling of one asset declaration */
  finalName(declaration: Declaration): string
  /** the token a file's asset names carry — the namespace, or the library token plus content hash */
  tokenFor(source: SourceFile): string
  /** a resolver bound to one file: a reference spelling to its final name, or `undefined` to copy */
  resolverFor(source: SourceFile): (spelling: string) => string | undefined
}

/**
 * Builds the asset-name machinery. The package's own asset names carry the pack namespace as
 * their token — the same value the entity identifiers use. A vendored asset's names carry its
 * library's package token plus a truncated sha256 of the declaring file's bytes, so an identical
 * name means identical bytes by construction: consumers vendoring one library version share names
 * for unchanged assets and diverge per asset where content differs. Where a vendored material
 * names a parent that is itself rewritten, the parent's final name folds into the hash input
 * (sorted, so the digest is order-independent), and a parent cycle fails the build.
 *
 * A reference resolves against the declarations of the pack that wrote it first. In the
 * consumer's own content that is the whole of bare binding — a bare reference a merged pack
 * declares fails printing the qualified spellings, never binding and never copying. Vendored
 * content falls back to the other merged packs where exactly one declares the name, several
 * being ambiguous; on both paths an unbound name copies as written unless only an unmerged
 * supplier declares it.
 */
function assetNames(inputs: AssetNamesInputs): AssetNames {
  const { options, files, declarations, texts, bytes, libraryTokens, diagnosis, errors } = inputs
  const sourceByFile = new Map(files.map((source) => [source.file, source]))
  const assets = declarations.filter((declaration) => declaration.category !== 'entity')
  const originByPrefix = new Map(options.vendored.map((pack) => [pack.prefix, pack.name]))
  const prefixByOrigin = new Map(options.vendored.map((pack) => [pack.name, pack.prefix]))

  const scopeKey = (origin: string, kind: PackKind, spelling: string): string => `${origin} ${kind} ${spelling}`
  const scopeIndex = new Map<string, Declaration>()
  const crossIndex = new Map<string, Declaration[]>()
  for (const declaration of assets) {
    const key = scopeKey(declaration.origin, declaration.kind, declaration.spelling)
    if (!scopeIndex.has(key)) {
      scopeIndex.set(key, declaration)
    }
    const cross = `${declaration.kind} ${declaration.spelling}`
    const list = crossIndex.get(cross) ?? []
    list.push(declaration)
    crossIndex.set(cross, list)
  }

  const hashMemo = new Map<string, string>()
  const hashing = new Set<string>()

  function resolveDeclaration(
    origin: string,
    kind: PackKind,
    spelling: string,
    referencingFile: string,
  ): Declaration | undefined {
    // ahead of the bare steps: in the consumer's own content, a merged dependency's prefix in
    // the qualifier position binds the reference to that dependency's declaration
    if (origin === '') {
      const qualified = parseQualified(spelling)
      const target = qualified === undefined ? undefined : originByPrefix.get(qualified.prefix)
      if (qualified !== undefined && target !== undefined) {
        const bound = scopeIndex.get(scopeKey(target, kind, qualified.remainder))
        if (bound !== undefined) {
          return bound
        }
        errors.push(
          `${referencingFile}: ${spelling} carries the prefix of ${target}, which declares no asset ${qualified.remainder}`,
        )
        return undefined
      }
    }

    const own = scopeIndex.get(scopeKey(origin, kind, spelling))
    if (own !== undefined) {
      return own
    }
    const candidates = (crossIndex.get(`${kind} ${spelling}`) ?? []).filter(
      (declaration) => declaration.origin !== origin,
    )
    const byOrigin = new Map(candidates.map((declaration) => [declaration.origin, declaration]))

    // in the consumer's own content, bare means yours or vanilla: an unqualified reference
    // never binds to a merged dependency, and one a merged pack declares fails loudly rather
    // than silently binding — or silently shadowing a vanilla name — with the qualified
    // spellings printed as the fix
    if (origin === '') {
      if (byOrigin.size > 0) {
        const claimants = candidates
          .map((declaration) => `${declaration.file} (${originLabel(declaration.origin)})`)
          .join(' and ')
        const fixes = [...byOrigin.keys()]
          .map((declarer) => prefixByOrigin.get(declarer))
          .filter((prefix): prefix is string => prefix !== undefined)
          .sort()
          .map((prefix) => qualifiedSpelling(prefix, spelling))
        errors.push(
          `the bare reference ${spelling} in ${referencingFile} matches nothing this pack declares, and an unqualified reference never binds to a merged dependency — it is declared by ${claimants}: qualify it as ${fixes.join(' or ')}`,
        )
        return undefined
      }
      const supplier = diagnosis.assets.get(`${kind} ${spelling}`)
      if (supplier !== undefined) {
        errors.push(danglingMessage(referencingFile, spelling, supplier))
      }
      return undefined
    }

    // vendored content has no qualifier to write, so its cross-pack references keep the
    // unique-declarer rule
    if (byOrigin.size === 0) {
      const supplier = diagnosis.assets.get(`${kind} ${spelling}`)
      if (supplier !== undefined) {
        errors.push(danglingMessage(referencingFile, spelling, supplier))
      }
      return undefined
    }
    if (byOrigin.size === 1) {
      return candidates[0]
    }
    const claimants = candidates
      .map((declaration) => `${declaration.file} (${originLabel(declaration.origin)})`)
      .join(' and ')
    errors.push(`the reference ${spelling} in ${referencingFile} is ambiguous: it is declared by ${claimants}`)
    return undefined
  }

  function hashOf(file: string): string {
    const memoised = hashMemo.get(file)
    if (memoised !== undefined) {
      return memoised
    }
    if (hashing.has(file)) {
      errors.push(`${file}: its material parents form a reference cycle, so its names cannot be hashed`)
      return 'cycle'
    }
    hashing.add(file)

    const extras = new Set<string>()
    const source = sourceByFile.get(file)
    if (source?.content === 'material') {
      for (const parent of materialParents(texts.get(file))) {
        const referent = resolveDeclaration(source.half.origin, source.half.kind, parent, file)
        if (referent !== undefined && referent.file !== file) {
          extras.add(finalName(referent))
        }
      }
    }
    hashing.delete(file)

    const digest = createHash('sha256')
      .update(bytes.get(file) ?? Buffer.from(texts.get(file) ?? ''))
      .update(' ')
      .update([...extras].sort().join(' '))
      .digest('hex')
      .slice(0, VENDORED_HASH_LENGTH)
    hashMemo.set(file, digest)
    return digest
  }

  function tokenOf(origin: string, file: string): string {
    return origin === '' ? options.namespace : vendoredAssetToken(libraryTokens.get(origin) ?? origin, hashOf(file))
  }

  function finalName(declaration: Declaration): string {
    return assetSpelling(declaration, tokenOf(declaration.origin, declaration.file))
  }

  return {
    finalName,
    tokenFor: (source) => tokenOf(source.half.origin, source.file),
    resolverFor: (source) => (spelling) => {
      const declaration = resolveDeclaration(source.half.origin, source.half.kind, spelling, source.file)
      return declaration === undefined ? undefined : finalName(declaration)
    },
  }
}

/** The structural keywords a dotted asset spelling may open with, longest first. */
const DOTTED_KEYWORDS = ['controller.render.', 'controller.animation.', 'animation.', 'geometry.']

/** A reference spelling split at its qualifier position: the candidate prefix, and the rest. */
interface QualifiedForm {
  prefix: string
  /** the spelling as the named dependency's own content writes it */
  remainder: string
}

/**
 * Splits an asset reference at its qualifier position: the segment after the structural keyword
 * for the dotted kinds (`geometry.<q>.<name>`), the first path segment under `textures/` for a
 * texture, and the first dot-segment of a flat material name. `undefined` where the spelling has
 * no qualifier position — a bare name with nothing after the candidate, say. Whether the
 * candidate is a merged prefix is the caller's to decide; the qualified spelling never reaches
 * the output, so its engine validity is moot.
 */
function parseQualified(spelling: string): QualifiedForm | undefined {
  for (const keyword of DOTTED_KEYWORDS) {
    if (spelling.startsWith(keyword)) {
      const rest = spelling.slice(keyword.length)
      const dot = rest.indexOf('.')
      if (dot <= 0 || dot === rest.length - 1) {
        return undefined
      }
      return { prefix: rest.slice(0, dot), remainder: keyword + rest.slice(dot + 1) }
    }
  }
  if (spelling.startsWith('textures/')) {
    const rest = spelling.slice('textures/'.length)
    const slash = rest.indexOf('/')
    if (slash <= 0 || slash === rest.length - 1) {
      return undefined
    }
    return { prefix: rest.slice(0, slash), remainder: `textures/${rest.slice(slash + 1)}` }
  }
  const dot = spelling.indexOf('.')
  if (dot <= 0 || dot === spelling.length - 1) {
    return undefined
  }
  return { prefix: spelling.slice(0, dot), remainder: spelling.slice(dot + 1) }
}

/** The qualified form of a dependency's bare spelling: the inverse of {@link parseQualified}. */
function qualifiedSpelling(prefix: string, spelling: string): string {
  for (const keyword of DOTTED_KEYWORDS) {
    if (spelling.startsWith(keyword)) {
      return `${keyword}${prefix}.${spelling.slice(keyword.length)}`
    }
  }
  if (spelling.startsWith('textures/')) {
    return `textures/${prefix}/${spelling.slice('textures/'.length)}`
  }
  return `${prefix}.${spelling}`
}

/**
 * An own asset declaration whose qualifier-position segment equals a merged dependency's prefix
 * would capture every qualified reference to that dependency, so it fails naming the declaration
 * and the prefix; changing the prefix in the vendor block is the fix.
 */
function checkPrefixShadowing(
  declarations: Declaration[],
  originByPrefix: Map<string, string>,
  errors: string[],
): void {
  for (const declaration of declarations) {
    if (declaration.origin !== '' || declaration.category === 'entity') {
      continue
    }
    const qualified = parseQualified(declaration.spelling)
    const holder = qualified === undefined ? undefined : originByPrefix.get(qualified.prefix)
    if (qualified !== undefined && holder !== undefined) {
      errors.push(
        `${declaration.file}: the ${declaration.category} name ${declaration.spelling} sits in the qualifier position of ${holder}'s prefix ${JSON.stringify(qualified.prefix)}, so a qualified reference could never reach that dependency: give ${holder} a different prefix in the vendor block`,
      )
    }
  }
}

/** The relative path with its basename prefixed by a token: `models/minion.geo.json`, `lib.`. */
function prefixedBasename(rel: string, token: string): string {
  const dir = path.posix.dirname(rel)
  const base = `${token}.${path.posix.basename(rel)}`
  return dir === '.' ? base : `${dir}/${base}`
}

/** The parent names a `.material` file's declarations reference, in declaration order. */
function materialParents(text: string | undefined): string[] {
  if (text === undefined) {
    return []
  }
  let parsed: unknown
  try {
    parsed = parseJson(text)
  } catch {
    return []
  }
  return materialKeys(parsed).flatMap((key) => {
    const parts = key.split(':')
    return parts.length > 1 ? [parts[1]] : []
  })
}

/** The rewritten spelling of a non-entity declaration: the token written into the name. */
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
  resolveEntity: (spelling: string) => string | undefined,
  resolve: (spelling: string) => string | undefined,
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
      rewriteBehaviorEntity(parsed, resolveEntity, resolve, family)
      break
    case 'client-entity':
      rewriteClientEntity(parsed, resolveEntity, resolve)
      break
    case 'geometry':
      rewriteGeometry(parsed, resolve)
      break
    case 'material':
      rewriteMaterial(parsed, resolve)
      break
    case 'render-controller':
      renameKeys(parsed, 'render_controllers', resolve)
      break
    case 'animation':
      renameKeys(parsed, 'animations', resolve)
      break
    case 'animation-controller':
      renameKeys(parsed, 'animation_controllers', resolve)
      break
    default:
      break
  }
  return JSON.stringify(parsed) === before ? Buffer.from(text) : serializeJson(parsed)
}

function rewriteBehaviorEntity(
  parsed: Record<string, unknown>,
  resolveEntity: (spelling: string) => string | undefined,
  resolve: (spelling: string) => string | undefined,
  family: string,
): void {
  const entity = parsed['minecraft:entity']
  if (!isRecord(entity)) {
    return
  }
  const description = entity.description
  if (isRecord(description)) {
    if (typeof description.identifier === 'string') {
      description.identifier = resolveEntity(description.identifier) ?? description.identifier
    }
    rewriteRecordValues(description.animations, resolve)
  }
  stampFamily(entity, family)
}

function rewriteClientEntity(
  parsed: Record<string, unknown>,
  resolveEntity: (spelling: string) => string | undefined,
  resolve: (spelling: string) => string | undefined,
): void {
  const entity = parsed['minecraft:client_entity']
  if (!isRecord(entity) || !isRecord(entity.description)) {
    return
  }
  const description = entity.description

  if (typeof description.identifier === 'string') {
    description.identifier = resolveEntity(description.identifier) ?? description.identifier
  }
  rewriteRecordValues(description.geometry, resolve)
  rewriteRecordValues(description.textures, resolve)
  rewriteRecordValues(description.materials, resolve)
  rewriteRecordValues(description.animations, resolve)

  if (Array.isArray(description.render_controllers)) {
    description.render_controllers = description.render_controllers.map((entry) => {
      if (typeof entry === 'string') {
        return resolve(entry) ?? entry
      }
      if (isRecord(entry)) {
        return Object.fromEntries(Object.entries(entry).map(([key, value]) => [resolve(key) ?? key, value]))
      }
      return entry as unknown
    })
  }
}

function rewriteGeometry(parsed: Record<string, unknown>, resolve: (spelling: string) => string | undefined): void {
  const modern = parsed['minecraft:geometry']
  if (Array.isArray(modern)) {
    for (const entry of modern) {
      if (isRecord(entry) && isRecord(entry.description) && typeof entry.description.identifier === 'string') {
        entry.description.identifier = resolve(entry.description.identifier) ?? entry.description.identifier
      }
    }
  }
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('geometry.')) {
      const renamed = resolve(key)
      if (renamed !== undefined) {
        parsed[renamed] = parsed[key]
        Reflect.deleteProperty(parsed, key)
      }
    }
  }
}

function rewriteMaterial(parsed: Record<string, unknown>, resolve: (spelling: string) => string | undefined): void {
  if (!isRecord(parsed.materials)) {
    return
  }
  parsed.materials = Object.fromEntries(
    Object.entries(parsed.materials).map(([key, value]) => {
      if (key === 'version') {
        return [key, value]
      }
      const parts = key.split(':')
      const renamed = resolve(parts[0]) ?? parts[0]
      if (parts.length === 1) {
        return [renamed, value]
      }
      return [`${renamed}:${resolve(parts[1]) ?? parts[1]}`, value]
    }),
  )
}

function renameKeys(
  parsed: Record<string, unknown>,
  field: string,
  resolve: (spelling: string) => string | undefined,
): void {
  const record = parsed[field]
  if (!isRecord(record)) {
    return
  }
  parsed[field] = Object.fromEntries(Object.entries(record).map(([key, value]) => [resolve(key) ?? key, value]))
}

/** Rewrites the string values of a reference map — geometry, textures, materials, animations. */
function rewriteRecordValues(value: unknown, resolve: (spelling: string) => string | undefined): void {
  if (!isRecord(value)) {
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      value[key] = resolve(entry) ?? entry
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
function rewriteLang(
  source: SourceFile,
  text: string,
  resolveEntity: (spelling: string) => string | undefined,
  errors: string[],
): string {
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
    const rewritten = resolveEntity(match[2])
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
