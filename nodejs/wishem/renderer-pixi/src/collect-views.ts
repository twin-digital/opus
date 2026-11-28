import type { Id } from '@thrashplay/wishem-core'
import { parseSidecar, PIXI_KIND } from './sidecar.js'
import type { CollectedView, PixiView, ViewTable } from './types.js'

export class ViewCollectionError extends Error {
  /** The file names of the sidecars that the error is about. */
  readonly files: readonly string[]

  constructor(message: string, files: readonly string[]) {
    super(message)
    this.name = 'ViewCollectionError'
    this.files = files
  }
}

const SIDECAR_SUFFIX = '.view.json'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const isView = (value: unknown): value is PixiView =>
  isRecord(value) && typeof value.create === 'function' && typeof value.update === 'function'

/** Each argument is the result of `import.meta.glob` with `eager: true`. */
export const collectViews = (sidecars: Record<string, unknown>, modules: Record<string, unknown>): ViewTable => {
  const table = new Map<Id, CollectedView>()

  for (const path of Object.keys(sidecars).sort()) {
    const sidecarFile = fileName(path)
    const module = sidecars[path]
    const sidecar = parseSidecar(isRecord(module) ? module.default : undefined)
    if (!sidecar) {
      throw new ViewCollectionError(
        `wishem: the sidecar ${sidecarFile} is not a JSON object with a "kind" and a "componentType" that are text. No view is drawn.`,
        [sidecarFile],
      )
    }
    if (sidecar.kind !== PIXI_KIND) {
      continue
    }

    const viewPath = `${path.slice(0, path.length - SIDECAR_SUFFIX.length)}.ts`
    const viewFile = fileName(viewPath)
    const viewModule = viewPath.endsWith('.test.ts') ? undefined : modules[viewPath]
    if (viewModule === undefined) {
      throw new ViewCollectionError(
        `wishem: the sidecar ${sidecarFile} has no view file ${viewFile}. No view is drawn.`,
        [sidecarFile],
      )
    }
    const view = isRecord(viewModule) ? viewModule.default : undefined
    if (!isView(view)) {
      throw new ViewCollectionError(
        `wishem: the view file ${viewFile} of the sidecar ${sidecarFile} has no default export with a "create" function and an "update" function. No view is drawn.`,
        [sidecarFile],
      )
    }

    const existing = table.get(sidecar.componentType)
    if (existing) {
      throw new ViewCollectionError(
        `wishem: the sidecars ${existing.sidecar} and ${sidecarFile} name the same component type ${sidecar.componentType}. No view is drawn.`,
        [existing.sidecar, sidecarFile],
      )
    }
    table.set(sidecar.componentType, { sidecar: sidecarFile, componentType: sidecar.componentType, view })
  }

  return table
}
