import { readFile, writeFile } from 'fs/promises'
import type { PreprocessFn } from './pandoc.js'

/**
 * Preprocessor which ensures a markdown file has a trailing newline.
 */
export const requireTrailingNewline: PreprocessFn = async (textFile, context) => {
  const content = await readFile(textFile, 'utf-8')

  if (!content.endsWith('\n')) {
    // Create temp file with trailing newline
    const tempFile = context.getTempPath('.md')
    await writeFile(tempFile, content + '\n', 'utf-8')
    return tempFile
  }

  // Use original file as-is
  return textFile
}
