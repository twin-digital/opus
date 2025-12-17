import { pandoc, type PandocOptions } from './pandoc/pandoc.js'
import { requireTrailingNewline } from './pandoc/markdown.js'

const convertWithPandoc = (
  inputFiles: string[],
  { extraArgs, outputFormat = 'html' }: Pick<PandocOptions, 'extraArgs' | 'outputFormat'>,
) =>
  pandoc({
    extraArgs: {
      standalone: true,
      ...extraArgs,
    },
    inputFiles: inputFiles.map((path) => ({
      format: 'markdown',
      path,
    })),
    outputFormat,
    preprocessors: {
      markdown: requireTrailingNewline,
    },
  })

/**
 * Uses `pandoc` to assemble multiple markdown input files into a single markdown string. This applies preprocessors
 * necessary to correct common issues encountered when performing concatenation of markdown:
 *
 * - lack of trailing newlines can confuse block detection
 */
export const assembleMarkdown = (inputFiles: string[]): Promise<string> =>
  convertWithPandoc(inputFiles, { outputFormat: 'markdown' })

/**
 * Uses `pandoc` to assemble multiple markdown input files into a single markdown string, and transform the resulting
 * combined file into HTML. This applies preprocessors necessary to correct common issues encountered when transforming
 * markdown:
 *
 * - lack of trailing newlines can confuse block detection
 */
export const transformMarkdown = async (inputFiles: string[], stylesheets: string[] = []): Promise<string> =>
  convertWithPandoc(inputFiles, {
    extraArgs: {
      css: stylesheets,
      embedResources: true,
    },
    outputFormat: 'html5',
  })

export { type PandocOptions }
