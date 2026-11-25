// Writes the types of the props of the views.
// Usage: node generate.ts [--check] [--model <folder>] [--views <folder>]
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { validateModel, type Problem } from '@thrashplay/wishem-core'
import { readModelFolder, withSource } from '@thrashplay/wishem-host-nodejs'
import { formatProblem } from '@thrashplay/wishem-host-nodejs/format'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes, type ViewTypesFile } from './view-types.ts'

const packageRoot = resolve(import.meta.dirname, '..')

const describeProps = (file: ViewTypesFile) =>
  [
    ...(file.addedProps.length > 0 ? [`added ${file.addedProps.join(', ')}`] : []),
    ...(file.removedProps.length > 0 ? [`removed ${file.removedProps.join(', ')}`] : []),
  ].join(', ')

const describeChange = (file: ViewTypesFile) => {
  const props = describeProps(file)
  return props === '' ? '' : `: ${props}`
}

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean' },
      model: { type: 'string' },
      views: { type: 'string' },
    },
  })
  // pnpm runs the script in the package folder and sets INIT_CWD to the folder of the person.
  const fromPerson = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path)
  const model = values.model === undefined ? modelFolder : fromPerson(values.model)
  const views = values.views === undefined ? resolve(packageRoot, 'src', 'views') : fromPerson(values.views)
  const check = values.check === true

  console.log(`wishem: model ${model}`)

  const folder = await readModelFolder(model)
  let problems: Problem[] = folder.problems
  let definitions
  if (folder.data !== undefined) {
    const validation = validateModel(folder.data)
    if (validation.ok) {
      definitions = validation.model.definitions
      validation.warnings.forEach((warning) => {
        console.log(formatProblem(withSource([warning], folder)[0] ?? warning))
      })
    } else {
      problems = withSource(validation.problems, folder)
    }
  }
  if (definitions === undefined) {
    problems.forEach((problem) => {
      console.log(formatProblem(problem))
    })
    return 1
  }

  const result = await generateViewTypes({ definitions, views, check })
  result.warnings.forEach((warning) => {
    console.log(`wishem: warning: ${warning}`)
  })
  result.errors.forEach((error) => {
    console.log(`wishem: error: ${error}`)
  })

  let changed = false
  let notCurrent = false
  for (const file of result.files) {
    if (file.status === 'written') {
      console.log(`wishem: wrote ${file.file}${describeChange(file)}`)
    } else if (file.status === 'changed') {
      console.log(`wishem: changed ${file.file}${describeChange(file)}`)
    } else if (file.status === 'removed') {
      console.log(`wishem: removed ${file.file}`)
    } else if (file.status === 'not-current') {
      console.log(`wishem: ${file.file} is not current${describeChange(file)}`)
      notCurrent = true
    }
    changed ||= file.status !== 'current'
  }
  if (notCurrent) {
    console.log('wishem: run the generate script, then correct each view that the type check names')
  }
  if (!changed && result.errors.length === 0) {
    const count = result.files.length
    console.log(`wishem: the generated files of ${String(count)} ${count === 1 ? 'view are' : 'views are'} current`)
  }
  return result.errors.length > 0 || notCurrent ? 1 : 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error instanceof Error ? `wishem: ${error.message}` : error)
    process.exitCode = 1
  },
)
