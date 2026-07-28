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

/** The signal classes a container class exposes as properties (WorldAfterEvents' 55, and so on). */
const signalsOf = (container: string): string[] => {
  const { symbol, declaration } = classNamed(container)
  return checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .map((property) => checker.typeToString(checker.getTypeOfSymbolAtLocation(property, declaration)))
    .filter((name) => classes.has(name))
}

const componentClasses = [...classes.keys()].filter((name) => /^Entity.*Component$/.test(name))

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

const FAKED = [
  ...new Set([
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
  Entity: ['id', 'typeId'],
  Player: ['id', 'typeId'],
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
 * The arity check a method opens with, or `null` where it requires no argument. Only the minimum is
 * enforced; the message names both bounds, which is why the manifest carries both.
 */
const arityCheck = (method: Method): string | null => {
  if (method.minArity === 0) {
    return null
  }
  const expected =
    method.maxArity === Infinity || method.maxArity === method.minArity ?
      `'${String(method.minArity)}'`
    : `'${String(method.minArity)}-${String(method.maxArity)}'`
  return `checkArity(arguments.length, ${String(method.minArity)}, ${expected})`
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
  return lines.join('\n')
}

// ---------------------------------------------------------------------------

fs.rmSync(fakesDir, { recursive: true, force: true })
fs.mkdirSync(fakesDir, { recursive: true })

for (const name of FAKED) {
  const contents = REGISTRY_CLASSES.includes(name) ? registryFile(name) : classFile(name)
  fs.writeFileSync(path.join(fakesDir, `${name}.ts`), contents)
}

fs.writeFileSync(
  path.join(outDir, 'index.ts'),
  [
    header('Every faked class, re-exported for the hand-written behaviour to construct.'),
    ...FAKED.map((name) => `export { Fake${name} } from './fakes/${name}.js'`),
    '',
  ].join('\n'),
)
fs.writeFileSync(path.join(outDir, 'manifests.ts'), manifestFile())

const memberCount = FAKED.reduce((total, name) => {
  const { methods, properties } = surfaceFor(name)
  return total + methods.length + properties.length
}, 0)
console.log(`generated ${String(FAKED.length)} classes, ${String(memberCount)} members`)
