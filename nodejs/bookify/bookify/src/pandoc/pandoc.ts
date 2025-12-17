import { $ } from 'execa'
import { extname } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import kebabCase from 'lodash-es/kebabCase.js'

export type PandocInputFile =
  | string
  | {
      /**
       * Format of the input file.
       * @default inferred from extension
       */
      format?: string

      /**
       * Path to the input file.
       */
      path: string
    }

/**
 * Context object passed to preprocessors, providing utilities for managing temporary files.
 */
export class PreprocessorContext {
  constructor(public readonly tempDir: string) {}

  /**
   * Returns a path within the temporary directory for creating a temp file.
   * The file is not created automatically.
   */
  getTempPath(suffix = ''): string {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return join(this.tempDir, `${uniqueId}${suffix}`)
  }
}

/**
 * Function used to pre-process an input file before passing it to pandoc.
 *
 * @param filePath path of the input file to preprocess
 * @param context context object providing utilities for temp file management
 * @returns
 *   path of the pre-processed file which should be passed to pandoc; may be the same as the input if
 *   no changes were made
 */
export type PreprocessFn = (filePath: string, context: PreprocessorContext) => string | Promise<string>

export interface PandocOptions {
  /**
   * Additional arguments to pass to pandoc. How each argument is handled depends on its type:
   *
   * - if the value is a string, it will be passed as an option (i.e. `--foo value`)
   * - if the value is a string array, it will be passed as an option multiple times (i.e. `--foo value1 --foo value2`)
   * - if the argument is the boolean value 'false', it will not be passed at all
   * - if the argument is the boolean value `true` it will be passed as a flag (i.e. `--foo`)
   *
   * Before being passed as arguments, the record's keys will first be converted to kebab-case (e.g., `anotherArg` will
   * become `--another-arg`.)
   */
  extraArgs?: Partial<Record<string, string | string[] | boolean>>

  /**
   * Array of files to process
   */
  inputFiles?: PandocInputFile[]

  /**
   * Output format which Pandoc should render
   */
  outputFormat: string

  /**
   * Format-specific preprocessors to apply.
   */
  preprocessors?: Partial<Record<string, PreprocessFn>>
}

// @todo - technically, we require pandoc >= 2.19.0, but don't assert the version. Ubuntu's is too old, for example.
let pandocAvailable: boolean | undefined
const checkPandocInstallation = async () => {
  try {
    await $`pandoc --version`
  } catch (_) {
    throw new Error('Pandoc is not installed or not available in PATH. Please install pandoc to continue.')
  }
}

const assertPandocAvailable = async () => {
  if (pandocAvailable === undefined) {
    await checkPandocInstallation()
    pandocAvailable = true
  }
}

/**
 * Invokes the `pandoc` CLI with the specified set of input files, returning the output from `pandoc`. If there are no
 * input files provided, an empty string is returned. Each input file may be specified as:
 *
 * - a file name, passed to pandoc
 * - an object with a `path` property, the value of which is passed to pandoc
 * - an object containing `path` and `format` properties. The `format` property is passed through as the format to pandoc
 *
 * It is possible to specify format-specific preprocessors which may modify the files before passing them to pandoc. The
 * `preprocessors` option is a record of { formatName, PreprocessFn } tuples. The PreprocessFn for each file's format
 * will be invoked with the file path, and the path returned by the preprocess will be passed to pandoc.
 */
export const pandoc = async ({
  extraArgs = {},
  inputFiles = [],
  outputFormat,
  preprocessors = {},
}: PandocOptions): Promise<string> => {
  await assertPandocAvailable()

  if (inputFiles.length === 0) {
    return ''
  }

  // Create temporary directory for preprocessors
  const tempDir = await mkdtemp(join(tmpdir(), 'pandoc-'))

  try {
    const context = new PreprocessorContext(tempDir)
    const args: string[] = []

    // Add extra arguments
    for (const [key, value] of Object.entries(extraArgs)) {
      const kebabKey = kebabCase(key)

      if (value === false) {
        // Skip if value is false
        continue
      } else if (value === true) {
        // Pass as flag if value is true
        args.push(`--${kebabKey}`)
      } else if (Array.isArray(value)) {
        // Pass as option with value multiple times if value is a string array
        for (const item of value) {
          args.push(`--${kebabKey}`, item)
        }
      } else if (value !== undefined) {
        // Pass as option with value if value is a string
        args.push(`--${kebabKey}`, value)
      }
    }

    for (const input of inputFiles) {
      const filePath = typeof input === 'string' ? input : input.path
      const format = typeof input === 'string' ? undefined : input.format

      // Determine the format for preprocessing
      const effectiveFormat = (format ?? extname(filePath).slice(1)) || 'markdown'

      // Apply preprocessor if one exists for this format
      const preprocessor = preprocessors[effectiveFormat]
      const processedPath = preprocessor ? await preprocessor(filePath, context) : filePath

      // Add format-specific reader if specified
      if (format) {
        args.push('-f', format, processedPath)
      } else {
        args.push(processedPath)
      }
    }

    // Invoke pandoc and capture output to stdout
    const result = await $`pandoc -t ${outputFormat} ${args}`
    return result.stdout
  } finally {
    // Clean up entire temp directory and all its contents
    await rm(tempDir, { recursive: true, force: true })
  }
}
