import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureConfig = join(packageDir, 'no-node-types-fixture', 'tsconfig.json')

describe('hub source with no Node.js types', () => {
  it('type-checks in a project with `types: []`', () => {
    const config = ts.getParsedCommandLineOfConfigFile(fixtureConfig, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      },
    })
    if (config === undefined) {
      throw new Error('The fixture config did not load.')
    }

    const program = ts.createProgram({ rootNames: config.fileNames, options: config.options })
    const problems = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => !diagnostic.file?.fileName.includes('/node_modules/'))
      .map((diagnostic) => {
        const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        if (diagnostic.file === undefined || diagnostic.start === undefined) {
          return text
        }
        const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        return `${diagnostic.file.fileName.replace(`${packageDir}/`, '')}:${String(line + 1)} ${text}`
      })

    expect(problems).toEqual([])
  })
})
