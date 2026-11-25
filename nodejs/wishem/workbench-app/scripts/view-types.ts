// Writes the types of the props of each React view from the sidecars and the definitions.
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import { propNames, type NameProblem } from '../src/renderer/field-names.ts'
import { parseSidecar, REACT_KIND } from '../src/renderer/sidecar.ts'

export interface ViewTypesOptions {
  definitions: readonly ComponentTypeDefinition[]
  /** The absolute path of the `views` folder. */
  views: string
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
const COMMAND = 'pnpm --filter @thrashplay/wishem-workbench-app generate'

/** The text of a generated file. No definition gives a `Props` type with no member. */
export const renderViewTypes = (
  sidecarFile: string,
  componentType: Id,
  definition?: ComponentTypeDefinition,
): string => {
  const header =
    `// Generated from ${sidecarFile} and the definition of its component type. Do not edit.\n` +
    `// To write this file again: ${COMMAND}\n\n`
  if (!definition) {
    return `${header}export type Props = object\n`
  }
  const quote = (text: string) => JSON.stringify(text).replaceAll('*/', '*\\/')
  const members = propNames(definition).props.map(
    ({ name, field }) =>
      `  /** The field ${quote(field.label)} (${field.id}). */\n  readonly ${name}: string | undefined\n`,
  )
  return (
    `${header}/** The fields of the component type ${quote(definition.label)} (${componentType}). */\n` +
    `export interface Props {\n${members.join('')}}\n`
  )
}

/** The names of the members in the text of a generated file. */
const readPropNames = (text: string): string[] => [...text.matchAll(/^ {2}readonly (\w+): /gm)].map((match) => match[1])

const describeProblem = (sidecar: string, componentType: Id, problem: NameProblem): string => {
  const where = `${sidecar}: `
  switch (problem.kind) {
    case 'same-name':
      return `${where}the fields ${problem.fields[0]} and ${problem.fields[1]} of the component type ${componentType} give the same name "${problem.name}"`
    case 'empty-name':
      return `${where}the label of the field ${problem.field} of the component type ${componentType} gives an empty name`
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
  const { definitions, views, check = false } = options
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
    outputs.push({ file, text: renderViewTypes(sidecarFile, sidecar.componentType, definition) })
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
