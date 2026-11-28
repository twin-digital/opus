import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const packageDir = fileURLToPath(new URL('../', import.meta.url))
const fixtureDir = fileURLToPath(new URL('../no-node-types-fixture/', import.meta.url))

// Returns the type errors in the files of this package for a project that has `"types": []`.
const checkFixture = (): string[] => {
  const config = ts.getParsedCommandLineOfConfigFile(`${fixtureDir}tsconfig.json`, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  })
  if (!config) {
    throw new Error('The fixture config is not readable.')
  }
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options })
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName.startsWith(packageDir) ?? true)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe('a package with no Node.js types', () => {
  it('imports the source of the clock with no type error', () => {
    expect(checkFixture()).toEqual([])
  })
})
