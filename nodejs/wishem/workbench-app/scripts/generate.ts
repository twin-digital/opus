// Writes the types of the props of the views.
// Usage: node generate.ts [--check] [--model <folder>] [--views <folder>]
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { validateModel, type Problem } from '@thrashplay/wishem-core'
import { readModelFolder, withSource } from '@thrashplay/wishem-host-nodejs'
import { formatProblem } from '@thrashplay/wishem-host-nodejs/format'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes } from './view-types.ts'
import { viewTypesLines } from './view-types-report.ts'

const packageRoot = resolve(import.meta.dirname, '..')

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
  viewTypesLines(result).forEach((line) => {
    console.log(line)
  })

  const changed = result.files.some((file) => file.status !== 'current')
  const notCurrent = result.files.some((file) => file.status === 'not-current')
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
