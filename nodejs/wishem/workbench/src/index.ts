import { fileURLToPath } from 'node:url'

/** The absolute path of the model folder of the base workbench. */
export const modelFolder = fileURLToPath(new URL('../model', import.meta.url))
