import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Problem } from '@thrashplay/wishem-core'

export interface ModelFolderResult {
  /** The data to give to the core. Absent when a file cannot be read or parsed. */
  data?: unknown
  /** Problems of files: a missing `state.json`, or text that is not valid JSON. */
  problems: Problem[]
  /** The file of each item of `definitions`, in the same order. Empty when `data` is absent. */
  definitionFiles: string[]
}

const STATE_FILE = 'state.json'
const DEFINITIONS_FOLDER = 'definitions'

const fileProblem = (source: string, message: string): Problem => ({
  severity: 'error',
  message,
  path: [],
  source,
})

const describeParseError = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error)
  const line = /line (\d+)/.exec(text)
  return line ? `the text is not valid JSON (line ${line[1]})` : 'the text is not valid JSON'
}

type Parsed = { ok: true; value: unknown } | { ok: false; problem: Problem }

const readJson = async (folder: string, source: string): Promise<Parsed> => {
  let text: string
  try {
    text = await readFile(path.join(folder, source), 'utf8')
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    return {
      ok: false,
      problem: fileProblem(source, missing ? 'the file does not exist' : `the file cannot be read (${String(error)})`),
    }
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    return { ok: false, problem: fileProblem(source, describeParseError(error)) }
  }
}

/** Reads `definitions/*.json` and `state.json` of a model folder into the data for a core. */
export const readModelFolder = async (folder: string): Promise<ModelFolderResult> => {
  const failure = (...problems: Problem[]): ModelFolderResult => ({ problems, definitionFiles: [] })

  const info = await stat(folder).catch(() => undefined)
  if (!info?.isDirectory()) {
    return failure(fileProblem(folder, `the model folder ${folder} does not exist`))
  }

  const names = await readdir(path.join(folder, DEFINITIONS_FOLDER)).catch(() => [] as string[])
  const definitionFiles = names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(DEFINITIONS_FOLDER, name))

  const [state, ...definitions] = await Promise.all([
    readJson(folder, STATE_FILE),
    ...definitionFiles.map((file) => readJson(folder, file)),
  ])

  const problems = [state, ...definitions].flatMap((parsed) => (parsed.ok ? [] : [parsed.problem]))
  if (problems.length > 0 || !state.ok) {
    return failure(...problems)
  }

  const entities = (state.value as { entities?: unknown } | null)?.entities
  return {
    data: {
      definitions: definitions.map((parsed) => (parsed.ok ? parsed.value : undefined)),
      entities,
    },
    problems: [],
    definitionFiles,
  }
}

/** Sets `source` on each problem from the core, by the `path` of the problem. */
export const withSource = (problems: Problem[], result: Pick<ModelFolderResult, 'definitionFiles'>): Problem[] =>
  problems.map((problem) => {
    const [section, index] = problem.path
    if (problem.source !== undefined) {
      return problem
    }
    if (section === 'entities') {
      return { ...problem, source: STATE_FILE }
    }
    if (section === 'definitions' && typeof index === 'number') {
      const source = index < result.definitionFiles.length ? result.definitionFiles[index] : undefined
      return source === undefined ? problem : { ...problem, source }
    }
    return problem
  })
