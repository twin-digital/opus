// The terminal lines for the result of the generator. The generate and start scripts share them.
import type { ViewTypesFile, ViewTypesResult } from './view-types.ts'

const describeProps = (file: ViewTypesFile) =>
  [
    ...(file.addedProps.length > 0 ? [`added ${file.addedProps.join(', ')}`] : []),
    ...(file.removedProps.length > 0 ? [`removed ${file.removedProps.join(', ')}`] : []),
  ].join(', ')

const describeChange = (file: ViewTypesFile) => {
  const props = describeProps(file)
  return props === '' ? '' : `: ${props}`
}

/** One line for each warning, each error, and each file that is not current. */
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
