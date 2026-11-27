// Writes the types of the props of each React view from the sidecars and the definitions.
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ComponentTypeDefinition, FieldType, Id } from '@thrashplay/wishem-core'
import { propNames, type NameProblem } from './field-names.js'
import { parseSidecar, REACT_KIND } from './sidecar.js'

export interface ViewTypesOptions {
  definitions: readonly ComponentTypeDefinition[]
  /** The absolute path of the `views` folder. */
  views: string
  /** The command that the header of each generated file names. */
  command: string
  /** Change no file. Default `false`. */
  check?: boolean
}

export interface ViewTypesFile {
  /** For example `AppBar.view.gen.ts`. */
  file: string
  status: 'written' | 'changed' | 'removed' | 'current' | 'not-current'
  addedProps: string[]
  removedProps: string[]
}

export interface ViewTypesResult {
  files: ViewTypesFile[]
  warnings: string[]
  errors: string[]
}

const SIDECAR_SUFFIX = '.view.json'
const GENERATED_SUFFIX = '.view.gen.ts'

/** The TypeScript type of the value of a field. */
const valueType = (type: FieldType): string => (type === 'reference' ? 'string' : type)

/** The text of a generated file. No definition gives `Props` with only `wishem`, and `Values` with no member. */
export const renderViewTypes = (
  sidecarFile: string,
  componentType: Id,
  command: string,
  definition?: ComponentTypeDefinition,
): string => {
  const header =
    `// Generated from ${sidecarFile} and the definition of its component type. Do not edit.\n` +
    `// To write this file again: ${command}\n\n` +
    "import type { ViewTools } from '@thrashplay/wishem-renderer-react'\n\n"
  const wishem = '  /** Sends inputs for this component. */\n  readonly wishem: ViewTools<Values>\n'
  if (!definition) {
    return `${header}export type Values = object\n\nexport interface Props {\n${wishem}}\n`
  }
  const quote = (text: string) => JSON.stringify(text).replaceAll('*/', '*\\/')
  const props = propNames(definition).props
  const doc = (label: string, id: string) => `  /** The field ${quote(label)} (${id}). */\n`
  const values = props.map(
    ({ name, field }) => `${doc(field.label, field.id)}  readonly ${name}: ${valueType(field.type)}\n`,
  )
  const members = props.map(
    ({ name, field }) => `${doc(field.label, field.id)}  readonly ${name}: ${valueType(field.type)} | undefined\n`,
  )
  const component = `${quote(definition.label)} (${componentType})`
  return (
    `${header}/** The values that \`wishem.setField\` takes for the component type ${component}. */\n` +
    `export interface Values {\n${values.join('')}}\n\n` +
    `/** The fields of the component type ${component}. */\n` +
    `export interface Props {\n${members.join('')}${wishem}}\n`
  )
}

/** The names of the field members of `Props` in the text of a generated file. */
const readPropNames = (text: string): string[] => {
  const start = text.indexOf('export interface Props {')
  if (start < 0) {
    return []
  }
  const end = text.indexOf('\n}', start)
  const body = text.slice(start, end < 0 ? undefined : end)
  return [...body.matchAll(/^ {2}readonly (\w+): /gm)].map((match) => match[1]).filter((name) => name !== 'wishem')
}

const describeProblem = (sidecar: string, componentType: Id, problem: NameProblem): string => {
  const where = `${sidecar}: `
  switch (problem.kind) {
    case 'same-name':
      return `${where}the fields ${problem.fields[0]} and ${problem.fields[1]} of the component type ${componentType} give the same name "${problem.name}"`
    case 'empty-name':
      return `${where}the label of the field ${problem.field} of the component type ${componentType} gives an empty name`
    case 'reserved-name':
      return `${where}the label of the field ${problem.field} of the component type ${componentType} gives the reserved name "${problem.name}"`
    case 'name-starts-with-digit':
      return `${where}the label of the field ${problem.field} of the component type ${componentType} gives the name "${problem.name}", which starts with a digit`
  }
}

const readIfExists = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

const describeFailure = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const generateViewTypes = async (options: ViewTypesOptions): Promise<ViewTypesResult> => {
  const { definitions, views, command, check = false } = options
  const result: ViewTypesResult = { files: [], warnings: [], errors: [] }

  let names: string[]
  try {
    names = await readdir(views)
  } catch (error) {
    result.errors.push(`${views}: the views folder cannot be read (${describeFailure(error)})`)
    return result
  }
  const sidecars = names.filter((name) => name.endsWith(SIDECAR_SUFFIX)).sort()
  const generatedFiles = names.filter((name) => name.endsWith(GENERATED_SUFFIX))
  const base = (name: string, suffix: string) => name.slice(0, -suffix.length)

  // The generated file of each sidecar that has a file, or that has an error.
  const expected = new Set<string>()
  const outputs: { file: string; text: string }[] = []

  for (const sidecarFile of sidecars) {
    const file = `${base(sidecarFile, SIDECAR_SUFFIX)}${GENERATED_SUFFIX}`
    let data: unknown
    try {
      data = JSON.parse(await readFile(join(views, sidecarFile), 'utf8')) as unknown
    } catch (error) {
      expected.add(file)
      result.errors.push(
        error instanceof SyntaxError ?
          `${sidecarFile}: the text is not valid JSON`
        : `${sidecarFile}: the file cannot be read (${describeFailure(error)})`,
      )
      continue
    }
    const sidecar = parseSidecar(data)
    if (!sidecar) {
      expected.add(file)
      result.errors.push(`${sidecarFile}: the sidecar needs a "kind" and a "componentType" that are text`)
      continue
    }
    if (sidecar.kind !== REACT_KIND) {
      continue
    }
    expected.add(file)

    const definition = definitions.find((candidate) => candidate.id === sidecar.componentType)
    if (!definition) {
      result.warnings.push(
        `${sidecarFile}: the component type ${sidecar.componentType} has no definition, so the type Props has no member`,
      )
    } else {
      const { problems } = propNames(definition)
      if (problems.length > 0) {
        result.errors.push(...problems.map((problem) => describeProblem(sidecarFile, sidecar.componentType, problem)))
        continue
      }
    }
    outputs.push({ file, text: renderViewTypes(sidecarFile, sidecar.componentType, command, definition) })
  }

  for (const { file, text } of outputs) {
    const path = join(views, file)
    try {
      const old = await readIfExists(path)
      const oldNames = old === undefined ? [] : readPropNames(old)
      const newNames = readPropNames(text)
      const addedProps = newNames.filter((name) => !oldNames.includes(name))
      const removedProps = oldNames.filter((name) => !newNames.includes(name))
      if (old === text) {
        result.files.push({ file, status: 'current', addedProps, removedProps })
        continue
      }
      if (check) {
        result.files.push({ file, status: 'not-current', addedProps, removedProps })
        continue
      }
      await writeFile(path, text)
      result.files.push({ file, status: old === undefined ? 'written' : 'changed', addedProps, removedProps })
    } catch (error) {
      result.errors.push(`${file}: the file cannot be written (${describeFailure(error)})`)
    }
  }

  for (const file of generatedFiles.sort()) {
    if (expected.has(file)) {
      continue
    }
    const path = join(views, file)
    try {
      const removedProps = readPropNames(await readFile(path, 'utf8'))
      if (!check) {
        await rm(path)
      }
      result.files.push({ file, status: check ? 'not-current' : 'removed', addedProps: [], removedProps })
    } catch (error) {
      result.errors.push(`${file}: the file cannot be removed (${describeFailure(error)})`)
    }
  }

  result.files.sort((a, b) => a.file.localeCompare(b.file))
  return result
}

const describeProps = (file: ViewTypesFile) =>
  [
    ...(file.addedProps.length > 0 ? [`added ${file.addedProps.join(', ')}`] : []),
    ...(file.removedProps.length > 0 ? [`removed ${file.removedProps.join(', ')}`] : []),
  ].join(', ')

const describeChange = (file: ViewTypesFile) => {
  const props = describeProps(file)
  return props === '' ? '' : `: ${props}`
}

/** One line for each warning, each error, and each file that is not current or that changed. */
export const viewTypesLines = (result: ViewTypesResult): string[] => [
  ...result.warnings.map((warning) => `wishem: warning: ${warning}`),
  ...result.errors.map((error) => `wishem: error: ${error}`),
  ...result.files.flatMap((file) => {
    switch (file.status) {
      case 'written':
        return [`wishem: wrote ${file.file}${describeChange(file)}`]
      case 'changed':
        return [`wishem: changed ${file.file}${describeChange(file)}`]
      case 'removed':
        return [`wishem: removed ${file.file}`]
      case 'not-current':
        return [`wishem: ${file.file} is not current${describeChange(file)}`]
      case 'current':
        return []
    }
  }),
]
