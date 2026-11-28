import { join } from 'node:path'

/** The absolute path of `nodejs/wishem/docs/architecture/`. */
export const architectureFolder: string = join(import.meta.dirname, '..', '..', 'docs', 'architecture')

/** The absolute path of `nodejs/wishem/docs/architecture/render.mjs`. */
export const renderScript: string = join(architectureFolder, 'render.mjs')
