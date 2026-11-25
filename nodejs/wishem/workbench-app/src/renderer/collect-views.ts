import type { Id } from '@thrashplay/wishem-core'
import type { View } from './define-view.js'

export interface CollectedView {
  /** The file name, for example `AppBar.tsx`. */
  file: string
  view: View
}

export type ViewTable = ReadonlyMap<Id, CollectedView>

export class ViewCollectionError extends Error {
  /** The files that the error is about. */
  readonly files: readonly string[]

  constructor(message: string, files: readonly string[]) {
    super(message)
    this.name = 'ViewCollectionError'
    this.files = files
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isView = (value: unknown): value is View =>
  isRecord(value) &&
  typeof value.componentType === 'string' &&
  isRecord(value.props) &&
  typeof value.render === 'function'

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** `modules` is the result of `import.meta.glob` with `eager: true`. */
export const collectViews = (modules: Record<string, unknown>): ViewTable => {
  const table = new Map<Id, CollectedView>()

  for (const path of Object.keys(modules)) {
    const file = fileName(path)
    if (file.endsWith('.test.tsx')) {
      continue
    }

    const module = modules[path]
    const view = isRecord(module) ? module.default : undefined
    if (!isView(view)) {
      throw new ViewCollectionError(
        `wishem: the file ${file} has no default export from defineView. No view is drawn.`,
        [file],
      )
    }

    const existing = table.get(view.componentType)
    if (existing) {
      throw new ViewCollectionError(
        `wishem: the views ${existing.file} and ${file} declare the same component type ${view.componentType}. No view is drawn.`,
        [existing.file, file],
      )
    }
    table.set(view.componentType, { file, view })
  }

  return table
}
