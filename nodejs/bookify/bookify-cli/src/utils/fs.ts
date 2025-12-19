import fsP from 'node:fs/promises'
import path from 'node:path'

/**
 * Ensures that the parent directory of the specified file exists.
 */
export const ensureDirectoryExists = async (filePath: string): Promise<void> => {
  const parent = path.dirname(path.resolve(filePath))
  await fsP.mkdir(parent, { recursive: true })
}
