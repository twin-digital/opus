// surface-codegen: reads the pinned @minecraft/server declarations and the committed guard data,
// and emits a class per faked type. Every declared member is written out, so `implements` makes the
// compiler check completeness on every build.
//
// Outputs:
//   src/generated/manifests.ts  — committed; the per-class member/arity manifest, checked against
//                                 the declarations by `satisfies` and an exhaustiveness assertion
//   src/generated/fakes/*.ts    — gitignored; the classes themselves
//
// Run: node tools/generate.ts

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import ts from 'typescript'

import guardData from '../src/guard-data.json' with { type: 'json' }

const require = createRequire(import.meta.url)

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dtsPath = require.resolve('@minecraft/server/index.d.ts', { paths: [packageRoot] })
const outDir = path.join(packageRoot, 'src', 'generated')
const fakesDir = path.join(outDir, 'fakes')

const fail = (message: string): never => {
  throw new Error(message)
}

const program = ts.createProgram([dtsPath], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.Node16,
  moduleResolution: ts.ModuleResolutionKind.Node16,
  noEmit: true,
  types: [],
})
const checker = program.getTypeChecker()
const source = program.getSourceFile(dtsPath) ?? fail(`cannot read ${dtsPath}`)
const moduleSymbol = checker.getSymbolAtLocation(source) ?? fail('@minecraft/server is not a module')
const moduleExports = checker.getExportsOfModule(moduleSymbol)

interface DeclaredClass {
  readonly symbol: ts.Symbol
  readonly declaration: ts.ClassDeclaration
}

/** Every exported class declaration, by name. */
const classes = new Map<string, DeclaredClass>()
for (const symbol of moduleExports) {
  const declaration = symbol.declarations?.find((node) => ts.isClassDeclaration(node))
  if (declaration) {
    classes.set(symbol.name, { symbol, declaration })
  }
}

const classNamed = (name: string): DeclaredClass =>
  classes.get(name) ?? fail(`@minecraft/server declares no class ${name}`)

/** The class a declaration extends, as the declarations name it, or `null` for a root class. */
const baseOf = (name: string): string | null => {
  const clause = classNamed(name).declaration.heritageClauses?.find(
    (heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword,
  )
  const expression = clause?.types[0]?.expression
  return expression && ts.isIdentifier(expression) ? expression.text : null
}

/** Whether a declared class's ancestry reaches `Error`. */
const isErrorClass = (name: string): boolean => {
  for (let current = baseOf(name); current !== null; current = classes.has(current) ? baseOf(current) : null) {
    if (current === 'Error') {
      return true
    }
  }
  return false
}

/** The signals a container class exposes, as property name to signal class name. */
const signalMapOf = (container: string): [string, string][] => {
  const { symbol, declaration } = classNamed(container)
  return checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .map((property): [string, string] => [
      property.name,
      checker.typeToString(checker.getTypeOfSymbolAtLocation(property, declaration)),
    ])
    .filter(([, className]) => classes.has(className))
}

/** The signal classes a container class exposes as properties (WorldAfterEvents' 55, and so on). */
const signalsOf = (container: string): string[] => signalMapOf(container).map(([, className]) => className)

/** The canonical component ids of EntityComponentTypeMap, each with the class it maps to. */
const componentClassById = (): [string, string][] => {
  const symbol = moduleExports.find((exported) => exported.name === 'EntityComponentTypeMap')
  if (!symbol) {
    return fail('@minecraft/server declares no EntityComponentTypeMap')
  }
  return checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .filter((property) => property.name.startsWith('minecraft:'))
    .map((property): [string, string] => {
      const node = property.valueDeclaration ?? property.declarations?.[0]
      if (!node) {
        return fail(`EntityComponentTypeMap.${property.name} has no declaration`)
      }
      return [property.name, checker.typeToString(checker.getTypeOfSymbolAtLocation(property, node))]
    })
    .sort((a, b) => a[0].localeCompare(b[0]))
}

// Every class the type map names, plus the abstract bases the declarations carry. Reading the type
// map is what catches `PlayerCursorInventoryComponent`, the one component not named `Entity*`.
const componentClasses = [
  ...new Set([
    ...componentClassById().map(([, className]) => className),
    ...[...classes.keys()].filter((name) => /^Entity.*Component$/.test(name)),
  ]),
].sort()

/** The registries the server bundle carries, each declared and throwing. */
const REGISTRY_CLASSES = [
  'BiomeTypes',
  'BlockStates',
  'BlockTypes',
  'DimensionTypes',
  'EffectTypes',
  'EnchantmentTypes',
  'EntityTypes',
  'ItemTypes',
]

const SIGNAL_CONTAINERS = ['WorldAfterEvents', 'WorldBeforeEvents', 'SystemAfterEvents', 'SystemBeforeEvents']

const FAKED = [
  ...new Set([
    'Component',
    'Entity',
    'Player',
    'World',
    'Dimension',
    'Effect',
    'EffectType',
    'System',
    'Scoreboard',
    'ScoreboardObjective',
    'ScoreboardIdentity',
    'ScreenDisplay',
    'WorldAfterEvents',
    'WorldBeforeEvents',
    'SystemAfterEvents',
    'SystemBeforeEvents',
    ...REGISTRY_CLASSES,
    ...componentClasses,
    ...signalsOf('WorldAfterEvents'),
    ...signalsOf('WorldBeforeEvents'),
    ...signalsOf('SystemAfterEvents'),
    ...signalsOf('SystemBeforeEvents'),
  ]),
].sort()

// ---------------------------------------------------------------------------
// Member enumeration
// ---------------------------------------------------------------------------

interface Method {
  readonly name: string
  /** The declared signature, copied verbatim, so the emitted member is the declared one. */
  readonly signature: string
  readonly minArity: number
  readonly maxArity: number
  readonly parameters: readonly { readonly name: string; readonly rest: boolean }[]
}

interface Property {
  readonly name: string
  readonly type: string
  readonly readonly: boolean
}

interface Surface {
  readonly methods: Method[]
  readonly properties: Property[]
}

/** A declared signature's arity bounds and the parameter names its body forwards. */
const parameterInfo = (
  declaration: ts.MethodDeclaration | ts.MethodSignature,
): Pick<Method, 'minArity' | 'maxArity' | 'parameters'> => {
  const parameters = [...declaration.parameters]
  return {
    minArity: parameters.filter((parameter) => !parameter.questionToken && !parameter.dotDotDotToken).length,
    maxArity: parameters.some((parameter) => parameter.dotDotDotToken) ? Infinity : parameters.length,
    parameters: parameters.map((parameter) => ({
      name: parameter.name.getText(source),
      rest: parameter.dotDotDotToken !== undefined,
    })),
  }
}

const isMethod = (node: ts.Declaration): node is ts.MethodDeclaration | ts.MethodSignature =>
  ts.isMethodDeclaration(node) || ts.isMethodSignature(node)

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name)

/** Splits the members of a class into the methods and properties the declarations give it. */
const split = (type: ts.Type, declaration: ts.ClassDeclaration, includeStatics: boolean): Surface => {
  const methods: Method[] = []
  const properties: Property[] = []
  for (const property of checker.getPropertiesOfType(type)) {
    if (includeStatics && property.name === 'prototype') {
      continue
    }
    const node = property.valueDeclaration ?? property.declarations?.[0]
    if (!node) {
      continue
    }
    if (isMethod(node)) {
      methods.push({
        name: property.name,
        signature: node.getText(source).replace(/;\s*$/, ''),
        ...parameterInfo(node),
      })
    } else {
      properties.push({
        name: property.name,
        type: checker.typeToString(
          checker.getTypeOfSymbolAtLocation(property, declaration),
          declaration,
          ts.TypeFormatFlags.NoTruncation,
        ),
        readonly: (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Readonly) !== 0,
      })
    }
  }
  return { methods: methods.sort(byName), properties: properties.sort(byName) }
}

/**
 * The surface of one faked class. A registry is reached through the bundle as the class itself —
 * `typeof BiomeTypes` — so its surface is the static side; everything else is the instance side.
 */
const surfaceOf = (name: string): Surface => {
  const { symbol, declaration } = classNamed(name)
  return REGISTRY_CLASSES.includes(name) ?
      split(checker.getTypeOfSymbolAtLocation(symbol, declaration), declaration, true)
    : split(checker.getDeclaredTypeOfSymbol(symbol), declaration, false)
}

const surface = new Map(FAKED.map((name) => [name, surfaceOf(name)]))

const surfaceFor = (name: string): Surface => surface.get(name) ?? fail(`no surface for ${name}`)

// ---------------------------------------------------------------------------
// Guard data — how each member behaves on an invalidated owner
// ---------------------------------------------------------------------------

interface GuardTable {
  readonly readable: readonly string[]
  readonly defaultProperty: string
  readonly defaultMethod: string
  readonly overrides: Readonly<Record<string, string | undefined>>
}

const tables: Readonly<Record<string, GuardTable>> = guardData.tables

const tableFor = (className: string): GuardTable | null => {
  const assigned = (guardData.assignments as Record<string, string | undefined>)[className]
  if (assigned !== undefined) {
    return tables[assigned]
  }
  if (!componentClasses.includes(className)) {
    return null
  }
  return guardData.attributeComponentClasses.includes(className) ? tables.attributeComponent : tables.entityComponent
}

/**
 * Checks the committed guard data against the surface just enumerated. The data is transcribed from
 * engine sweeps and the generator is otherwise happy to ignore a row it cannot place, so a version
 * bump that renames a member would quietly drop its guard — the one failure this data cannot afford.
 */
const checkGuardData = (): void => {
  const unplaceable: string[] = []

  for (const className of Object.keys(guardData.assignments)) {
    if (!FAKED.includes(className)) {
      unplaceable.push(`assignments names ${className}, which is not a faked class`)
    }
  }
  for (const className of guardData.attributeComponentClasses) {
    if (!componentClasses.includes(className)) {
      unplaceable.push(`attributeComponentClasses names ${className}, which is not a component class`)
    }
  }

  /** Every member name of every class one table governs. */
  const membersGoverned = (table: GuardTable): Set<string> => {
    const names = new Set<string>()
    for (const className of FAKED) {
      if (tableFor(className) !== table) {
        continue
      }
      const { methods, properties } = surfaceFor(className)
      for (const member of [...methods, ...properties]) {
        names.add(member.name)
      }
    }
    return names
  }

  for (const [tableName, table] of Object.entries(tables)) {
    const governed = membersGoverned(table)
    if (governed.size === 0) {
      unplaceable.push(`table ${tableName} governs no faked class`)
      continue
    }
    for (const member of [...table.readable, ...Object.keys(table.overrides)]) {
      if (!governed.has(member)) {
        unplaceable.push(`table ${tableName} names ${member}, which no class it governs declares`)
      }
    }
  }

  if (unplaceable.length > 0) {
    fail(`guard-data.json no longer fits the declarations:\n  ${unplaceable.join('\n  ')}`)
  }
}

/**
 * The guard prologue for one member: `null` where the member stays readable on an invalid owner,
 * otherwise the call that throws what the engine was observed to throw there.
 */
const guardFor = (className: string, member: string, kind: 'method' | 'property'): string | null => {
  const table = tableFor(className)
  if (!table) {
    return null
  }
  if (table.readable.includes(member)) {
    return null
  }
  const shape = table.overrides[member] ?? (kind === 'method' ? table.defaultMethod : table.defaultProperty)
  const [form, ...named] = shape.split(':')
  const target = named.length > 0 ? named.join(':') : member
  switch (form) {
    case 'none':
      return null
    case 'invalid-entity-get':
      return `guardInvalidEntity(this, 'get property', '${target}')`
    case 'invalid-entity-set':
      return `guardInvalidEntity(this, 'set property', '${target}')`
    case 'invalid-entity-call':
      return `guardInvalidEntity(this, 'call function', '${target}')`
    case 'failed-property':
      return `guardFailedProperty(this, '${target}')`
    case 'failed-call':
      return `guardFailedCall(this, '${target}')`
    default:
      return fail(`unknown guard shape '${shape}' for ${className}.${member}`)
  }
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

const serverVersion: string = (
  JSON.parse(fs.readFileSync(path.join(path.dirname(dtsPath), 'package.json'), 'utf8')) as { version: string }
).version

const header = (what: string): string =>
  [`// GENERATED by tools/generate.ts from @minecraft/server ${serverVersion}. Do not edit.`, `// ${what}`, ''].join(
    '\n',
  )

const declaredTypeNames = moduleExports
  .map((symbol) => symbol.name)
  .filter((name) => /^[A-Z]/.test(name))
  .sort()

/** Members held as own data properties, so `Object.keys` reads what the engine's does. */
const OWN_PROPERTIES: Readonly<Record<string, readonly string[] | undefined>> = {
  Entity: ['typeId', 'id'],
  Player: ['typeId', 'id'],
}

const RUNTIME_IMPORTS = [
  'checkArity',
  'defineMembersEnumerable',
  'delegate',
  'guardFailedCall',
  'guardFailedProperty',
  'guardInvalidEntity',
  'initFake',
  'NotImplementedError',
  'type FakeState',
]

/**
 * The imports a generated file opens with. Both the declared type names and the runtime helpers are
 * filtered to what the body actually names, since the copied signatures decide that per class.
 */
const preamble = (what: string, body: string): string[] => {
  // Class and member names appear as string literals in delegation calls; those are not references.
  const code = body.replace(/'[^']*'/g, "''")
  // A name reached through the MC namespace is not an import either.
  const uses = (identifier: string): boolean => new RegExp(`(?<![.\\w])${identifier}\\b`).test(code)
  const declared = declaredTypeNames.filter((name) => uses(name))
  const runtime = RUNTIME_IMPORTS.filter((name) => uses(name.replace(/^type /, '')))
  return [
    header(what),
    "import type * as MC from '@minecraft/server'",
    // The declarations reach into @minecraft/common by namespace, so a copied signature can too.
    ...(uses('minecraftcommon') ? ["import type * as minecraftcommon from '@minecraft/common'"] : []),
    ...(declared.length > 0 ? [`import type { ${declared.join(', ')} } from '@minecraft/server'`] : []),
    `import { ${runtime.join(', ')} } from '../../runtime/member.js'`,
    '',
  ]
}

/**
 * The arity check a method opens with, or `null` where no call can miss either bound. Both bounds
 * are enforced; the message names both where they differ, which is why the manifest carries both.
 */
const arityCheck = (method: Method): string | null => {
  if (method.minArity === 0 && method.maxArity === Infinity) {
    return null
  }
  const expected =
    method.maxArity === Infinity || method.maxArity === method.minArity ?
      `'${String(method.minArity)}'`
    : `'${String(method.minArity)}-${String(method.maxArity)}'`
  const max = method.maxArity === Infinity ? 'Infinity' : String(method.maxArity)
  return `checkArity(arguments.length, ${String(method.minArity)}, ${max}, ${expected})`
}

/**
 * A registry class: reached through the bundle as the class itself, so its members are static and
 * every one throws — no behaviour in this cycle reads a registry.
 */
const registryFile = (name: string): string => {
  const { methods, properties } = surfaceFor(name)
  const lines = [`export class Fake${name} {`]
  for (const property of properties) {
    lines.push(
      `  static get ${property.name}(): ${property.type} {`,
      `    throw new NotImplementedError('${name}.${property.name}')`,
      '  }',
    )
  }
  for (const method of methods) {
    const arity = arityCheck(method)
    lines.push(`  ${method.signature} {`)
    if (arity) {
      lines.push(`    ${arity}`)
    }
    lines.push(`    throw new NotImplementedError('${name}.${method.name}')`, '  }')
  }
  lines.push('}', '', `Fake${name} satisfies typeof MC.${name}`, '')
  const body = lines.join('\n')
  return [...preamble(`The declared static surface of ${name}. Every member throws.`, body), body].join('\n')
}

/**
 * A faked class: every declared member written out, each an arity check over a guard prologue over
 * a delegation to the behaviour registered for that class.
 */
const classFile = (name: string): string => {
  const { methods, properties } = surfaceFor(name)
  const own = OWN_PROPERTIES[name] ?? []
  const typeOfOwn = (member: string): string =>
    properties.find((property) => property.name === member)?.type ?? fail(`${name} declares no ${member}`)

  const lines = [`export class Fake${name} implements MC.${name} {`]
  for (const member of own) {
    lines.push(`  readonly ${member}: ${typeOfOwn(member)}`)
  }
  lines.push('  constructor(state: FakeState) {', '    initFake(this, state)')
  for (const member of own) {
    lines.push(`    this.${member} = state.own['${member}'] as ${typeOfOwn(member)}`)
  }
  lines.push('  }', '')

  for (const property of properties) {
    if (own.includes(property.name)) {
      continue
    }
    const guard = guardFor(name, property.name, 'property')
    lines.push(`  get ${property.name}(): ${property.type} {`)
    if (guard) {
      lines.push(`    ${guard}`)
    }
    lines.push(`    return delegate(this, '${name}', '${property.name}', [])`, '  }')
    if (!property.readonly) {
      lines.push(`  set ${property.name}(value: ${property.type}) {`)
      if (guard) {
        lines.push(`    ${guard}`)
      }
      lines.push(`    delegate(this, '${name}', '${property.name}=', [value])`, '  }')
    }
  }

  for (const method of methods) {
    const guard = guardFor(name, method.name, 'method')
    const arity = arityCheck(method)
    const forwarded = method.parameters
      .map((parameter) => (parameter.rest ? `...${parameter.name}` : parameter.name))
      .join(', ')
    lines.push(`  ${method.signature} {`)
    if (arity) {
      lines.push(`    ${arity}`)
    }
    if (guard) {
      lines.push(`    ${guard}`)
    }
    lines.push(`    return delegate(this, '${name}', '${method.name}', [${forwarded}])`, '  }')
  }

  lines.push('}', '', `defineMembersEnumerable(Fake${name}.prototype)`, '')
  const body = lines.join('\n')
  return [
    ...preamble(`The declared surface of ${name}, written out; \`implements\` keeps it complete.`, body),
    body,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Manifests — committed, so a version bump reads as a diff of what moved
// ---------------------------------------------------------------------------

const manifestFile = (): string => {
  const lines = [
    header('The faked classes and their members, as the pinned declarations give them.'),
    "import type * as MC from '@minecraft/server'",
    '',
    'type MethodsOf<T> = {',
    '  [K in keyof T]-?: NonNullable<T[K]> extends (...args: never[]) => unknown ? K : never',
    '}[keyof T]',
    'type PropertiesOf<T> = Exclude<keyof T, MethodsOf<T>>',
    'type AssertNever<T extends never> = T',
    '',
    '/** One faked class: every declared member, and the arity bounds its methods were declared with. */',
    'export interface ClassManifest<T> {',
    '  readonly methods: readonly {',
    '    readonly name: MethodsOf<T>',
    '    readonly minArity: number',
    '    readonly maxArity: number',
    '  }[]',
    '  readonly properties: readonly PropertiesOf<T>[]',
    '}',
    '',
  ]

  for (const name of FAKED) {
    const { methods, properties } = surfaceFor(name)
    const target = REGISTRY_CLASSES.includes(name) ? `Omit<typeof MC.${name}, 'prototype'>` : `MC.${name}`
    lines.push(`export const ${name}Manifest = {`, '  methods: [')
    for (const method of methods) {
      const max = method.maxArity === Infinity ? 'Infinity' : String(method.maxArity)
      lines.push(`    { name: '${method.name}', minArity: ${String(method.minArity)}, maxArity: ${max} },`)
    }
    lines.push('  ],')
    lines.push(`  properties: [${properties.map((property) => `'${property.name}'`).join(', ')}],`)
    lines.push(
      `} as const satisfies ClassManifest<${target}>`,
      `type _${name}Complete = AssertNever<`,
      '  Exclude<',
      `    keyof ${target},`,
      `    (typeof ${name}Manifest)['methods'][number]['name'] | (typeof ${name}Manifest)['properties'][number]`,
      '  >',
      '>',
      `export type { _${name}Complete }`,
      '',
    )
  }
  lines.push(
    '/** Every class the generator emits a fake for. */',
    `export const FAKED_CLASSES = [${FAKED.map((name) => `'${name}'`).join(', ')}] as const`,
    '',
    '/** The event-signal classes, which all share one subscribe/unsubscribe behaviour. */',
    `export const SIGNAL_CLASSES = [${FAKED.filter((name) => name.endsWith('Signal'))
      .map((name) => `'${name}'`)
      .join(', ')}] as const`,
    '',
    '/** The entity component classes, and the attribute-shaped ones among them. */',
    `export const COMPONENT_CLASSES = [${componentClasses.map((name) => `'${name}'`).join(', ')}] as const`,
    `export const ATTRIBUTE_COMPONENT_CLASSES = [${guardData.attributeComponentClasses
      .map((name) => `'${name}'`)
      .join(', ')}] as const`,
    '',
    '/** The class for a component id a caller supplied, which may name no component at all. */',
    'export const componentClassFor = (id: string): (typeof FAKED_CLASSES)[number] | undefined =>',
    '  (COMPONENT_CLASS_BY_ID as Readonly<Record<string, (typeof FAKED_CLASSES)[number] | undefined>>)[id]',
    '',
    '/** The signal class behind each name on each container, as the declarations give them. */',
    'export const SIGNAL_CLASS_BY_CONTAINER: Readonly<',
    '  Record<string, Readonly<Record<string, (typeof FAKED_CLASSES)[number]>>>',
    '> = {',
    ...SIGNAL_CONTAINERS.flatMap((container) => [
      `  ${container}: {`,
      ...signalMapOf(container).map(([name, className]) => `    '${name}': '${className}',`),
      '  },',
    ]),
    '}',
    '',
    '/**',
    ' * The class behind each canonical component id, as EntityComponentTypeMap gives it. The key and',
    ' * value types tie this committed map to the declarations: an id the pinned version adds, or a',
    ' * class it renames, fails to compile here rather than misbehaving at runtime.',
    ' */',
    'export const COMPONENT_CLASS_BY_ID: Readonly<',
    '  Record<`${MC.EntityComponentTypes}`, (typeof FAKED_CLASSES)[number]>',
    '> = {',
    ...componentClassById().map(([id, className]) => `  '${id}': '${className}',`),
    '}',
    '',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The aliased `@minecraft/server` surface — values, classes and singleton bindings only
// ---------------------------------------------------------------------------

/** Every exported enum, with its members' declared constant values. */
const declaredEnums = (): { name: string; members: [string, string | number][] }[] =>
  moduleExports
    .flatMap((symbol) => {
      const declaration = symbol.declarations?.find((node) => ts.isEnumDeclaration(node))
      if (!declaration) {
        return []
      }
      const members = declaration.members.map((member): [string, string | number] => {
        const value = checker.getConstantValue(member)
        if (value === undefined) {
          return fail(`${symbol.name}.${member.name.getText(source)} has no constant value`)
        }
        return [member.name.getText(source).replace(/^['"]|['"]$/g, ''), value]
      })
      return [{ name: symbol.name, members }]
    })
    .sort(byName)

/** Every module-level constant the declarations carry, less the two singletons. */
const declaredConstants = (): { name: string; value: string | number }[] =>
  moduleExports
    .flatMap((symbol) => {
      const declaration = symbol.declarations?.find((node) => ts.isVariableDeclaration(node))
      if (!declaration || SINGLETONS.includes(symbol.name)) {
        return []
      }
      const initializerType = checker.getTypeOfSymbolAtLocation(symbol, declaration)
      if (!initializerType.isLiteral()) {
        return fail(`${symbol.name} is a module constant with no literal type`)
      }
      return [{ name: symbol.name, value: initializerType.value as string | number }]
    })
    .sort(byName)

/** The two module-scope bindings a test points at its own fakes; they are not generated. */
const SINGLETONS = ['world', 'system']

/**
 * Declared classes the library's own hand-written class stands in for. One class object per name,
 * so a pack's `catch (e) { e instanceof InvalidEntityError }` catches what the fakes actually
 * throw rather than a second class of the same name.
 */
const LIBRARY_ERROR_CLASSES: Readonly<Record<string, string | undefined>> = {
  InvalidEntityError: 'InvalidEntityError',
}

const literal = (value: string | number): string => (typeof value === 'string' ? `'${value}'` : String(value))

const shimSurfaceFile = (): string => {
  const classNames = [...classes.keys()].sort()
  const faked = classNames.filter((name) => FAKED.includes(name))
  const libraryErrors = classNames.filter((name) => LIBRARY_ERROR_CLASSES[name] !== undefined)
  const errors = classNames.filter((name) => isErrorClass(name) && LIBRARY_ERROR_CLASSES[name] === undefined)
  const placeholders = classNames.filter(
    (name) => !FAKED.includes(name) && !isErrorClass(name) && LIBRARY_ERROR_CLASSES[name] === undefined,
  )

  const lines = [
    header('The aliased @minecraft/server surface: enum values, constants and classes.'),
    "import { NotImplementedError } from '../../errors.js'",
    ...libraryErrors.map((name) => `import { ${LIBRARY_ERROR_CLASSES[name]} } from '../../errors.js'`),
    `import { ${faked.map((name) => `Fake${name}`).join(', ')} } from '../index.js'`,
    '',
    '// --- enums, frozen so a consumer cannot reshape the surface under another test ---',
    '',
  ]

  for (const { name, members } of declaredEnums()) {
    lines.push(
      `export const ${name} = Object.freeze({`,
      ...members.map(([member, value]) => `  ${JSON.stringify(member)}: ${literal(value)},`),
      '})',
      '',
    )
  }

  lines.push('// --- module-level constants ---', '')
  for (const { name, value } of declaredConstants()) {
    lines.push(`export const ${name} = ${literal(value)}`, '')
  }

  lines.push(
    '// --- classes the fakes implement: the fake class itself, so `instanceof` answers by identity ---',
    '',
    `export { ${faked.map((name) => `Fake${name} as ${name}`).join(', ')} }`,
    '',
    "// --- classes the library's own hand-written class stands in for: one class object per name ---",
    '',
    ...libraryErrors.map((name) => `export { ${LIBRARY_ERROR_CLASSES[name]} as ${name} }`),
    '',
    '// --- declared error classes: real Error subclasses, their declared fields left to the thrower ---',
    '',
  )
  for (const name of errors) {
    lines.push(`export class ${name} extends Error {`, `  override readonly name = '${name}'`, '}', '')
  }

  lines.push(
    '// --- every other declared class: present, and loud about being unimplemented ---',
    '',
    'const placeholder = (name: string): new (...args: never[]) => object =>',
    '  ({',
    '    [name]: class {',
    '      constructor() {',
    '        throw new NotImplementedError(name)',
    '      }',
    '    },',
    '  })[name] as new (...args: never[]) => object',
    '',
  )
  for (const name of placeholders) {
    lines.push(`export const ${name} = placeholder('${name}')`)
  }
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Sibling `@minecraft/*` script modules the fakes do not cover
// ---------------------------------------------------------------------------

/**
 * A stub for a sibling script module: the same three shapes the aliased surface uses, less the
 * fakes. Enum values and class identities are real, so a pack's imports resolve and its
 * `instanceof` checks answer; everything that would do work throws `NotImplementedError`. The
 * package models none of these modules' behaviour, and says so at the first call rather than
 * answering with a fabricated value.
 */
const siblingStubFile = (packageName: string): string => {
  const stubDts = require.resolve(`${packageName}/index.d.ts`, { paths: [packageRoot] })
  const stubProgram = ts.createProgram([stubDts], {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    noEmit: true,
    types: [],
  })
  const stubChecker = stubProgram.getTypeChecker()
  const stubSource = stubProgram.getSourceFile(stubDts) ?? fail(`cannot read ${stubDts}`)
  const stubModule = stubChecker.getSymbolAtLocation(stubSource) ?? fail(`${packageName} is not a module`)
  const stubExports = stubChecker.getExportsOfModule(stubModule)
  const stubVersion = (
    JSON.parse(fs.readFileSync(path.join(path.dirname(stubDts), 'package.json'), 'utf8')) as { version: string }
  ).version

  const declarationOf = <T extends ts.Declaration>(
    symbol: ts.Symbol,
    is: (node: ts.Node) => node is T,
  ): T | undefined => symbol.declarations?.find((node): node is T => is(node))

  const enums: { name: string; members: [string, string | number][] }[] = []
  const errorClasses: string[] = []
  const otherClasses: string[] = []
  const constants: string[] = []

  for (const symbol of stubExports) {
    const enumDeclaration = declarationOf(symbol, ts.isEnumDeclaration)
    if (enumDeclaration) {
      enums.push({
        name: symbol.name,
        members: enumDeclaration.members.map((member): [string, string | number] => {
          const value = stubChecker.getConstantValue(member)
          if (value === undefined) {
            return fail(`${symbol.name}.${member.name.getText(stubSource)} has no constant value`)
          }
          return [member.name.getText(stubSource).replace(/^['"]|['"]$/g, ''), value]
        }),
      })
      continue
    }
    const classDeclaration = declarationOf(symbol, ts.isClassDeclaration)
    if (classDeclaration) {
      const heritage = classDeclaration.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression
      const base = heritage && ts.isIdentifier(heritage) ? heritage.text : null
      ;(base === 'Error' ? errorClasses : otherClasses).push(symbol.name)
      continue
    }
    if (declarationOf(symbol, ts.isVariableDeclaration)) {
      constants.push(symbol.name)
    }
  }

  const lines = [
    `// GENERATED by tools/generate.ts from ${packageName} ${stubVersion}. Do not edit.`,
    `// A stub for ${packageName}: the module resolves, and every member says it is unmodelled.`,
    '',
    "import { NotImplementedError } from '../../errors.js'",
    '',
  ]

  for (const { name, members } of enums.sort(byName)) {
    lines.push(
      `export const ${name} = Object.freeze({`,
      ...members.map(([member, value]) => `  ${JSON.stringify(member)}: ${literal(value)},`),
      '})',
      '',
    )
  }

  for (const name of errorClasses.sort()) {
    lines.push(`export class ${name} extends Error {`, `  override readonly name = '${name}'`, '}', '')
  }

  lines.push(
    'const unmodelled = (name: string): never => {',
    '  throw new NotImplementedError(name)',
    '}',
    '',
    'const stubClass = (name: string): new (...args: never[]) => object =>',
    '  ({',
    '    [name]: class {',
    '      constructor() {',
    '        unmodelled(name)',
    '      }',
    '    },',
    '  })[name] as new (...args: never[]) => object',
    '',
    '/** A module-scope object whose every read says the module is unmodelled. */',
    'const stubObject = (name: string): object =>',
    '  new Proxy(',
    '    {},',
    '    {',
    '      get: (_target, property) => unmodelled(`${name}.${String(property)}`),',
    '    },',
    '  )',
    '',
  )
  for (const name of otherClasses.sort()) {
    lines.push(`export const ${name} = stubClass('${name}')`)
  }
  lines.push('')
  for (const name of constants.sort()) {
    lines.push(`export const ${name} = stubObject('${name}')`)
  }
  lines.push('')

  return lines.join('\n')
}

/** The sibling modules the package ships a stub for, and the file each is emitted to. */
const SIBLING_MODULES: readonly { readonly specifier: string; readonly file: string }[] = [
  { specifier: '@minecraft/server-ui', file: 'server-ui.ts' },
]

// ---------------------------------------------------------------------------

checkGuardData()

fs.rmSync(fakesDir, { recursive: true, force: true })
fs.mkdirSync(fakesDir, { recursive: true })

for (const name of FAKED) {
  const contents = REGISTRY_CLASSES.includes(name) ? registryFile(name) : classFile(name)
  fs.writeFileSync(path.join(fakesDir, `${name}.ts`), contents)
}

// The declared inheritance, spliced onto the flat generated classes. Every member is written out on
// every class, so the chain adds no lookups — what it adds is the `instanceof` the engine answers:
// a player is an Entity, a health component is an EntityComponent.
const inheritance = FAKED.flatMap((name) => {
  const base = baseOf(name)
  return base !== null && FAKED.includes(base) ? [[name, base] as const] : []
})

fs.writeFileSync(
  path.join(outDir, 'index.ts'),
  [
    header('Every faked class, re-exported for the hand-written behaviour to construct.'),
    ...FAKED.map((name) => `import { Fake${name} } from './fakes/${name}.js'`),
    '',
    '// The declared inheritance, as the pinned declarations give it.',
    ...inheritance.map(([name, base]) => `Object.setPrototypeOf(Fake${name}.prototype, Fake${base}.prototype)`),
    '',
    ...FAKED.map((name) => `export { Fake${name} }`),
    '',
    '/** Every fake class by the name of the type it stands in for, for construction by id. */',
    'export const FAKE_CLASSES = {',
    ...FAKED.map((name) => `  ${name}: Fake${name},`),
    '}',
    '',
  ].join('\n'),
)

const shimDir = path.join(outDir, 'shim')
fs.mkdirSync(shimDir, { recursive: true })
fs.writeFileSync(path.join(shimDir, 'surface.ts'), shimSurfaceFile())
// The version lives beside the surface rather than on it: the aliased surface exports what
// `@minecraft/server` declares and nothing more.
fs.writeFileSync(
  path.join(shimDir, 'version.ts'),
  [
    header('The @minecraft/server version every generated value was derived from.'),
    `export const SERVER_VERSION = '${serverVersion}'`,
    '',
  ].join('\n'),
)

for (const { specifier, file } of SIBLING_MODULES) {
  fs.writeFileSync(path.join(shimDir, file), siblingStubFile(specifier))
}
// The manifests are committed, so they are written the way the repo formats everything else.
const manifestPath = path.join(outDir, 'manifests.ts')
const prettierConfig = await resolveConfig(manifestPath)
fs.writeFileSync(manifestPath, await format(manifestFile(), { ...prettierConfig, filepath: manifestPath }))

const memberCount = FAKED.reduce((total, name) => {
  const { methods, properties } = surfaceFor(name)
  return total + methods.length + properties.length
}, 0)
console.log(`generated ${String(FAKED.length)} classes, ${String(memberCount)} members`)
