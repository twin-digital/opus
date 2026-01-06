import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'execa'
import type { DocumentRendererFn } from '../rendering.js'

export interface WeasyprintOptions {
  /**
   * Path to the weasyprint executable.
   * @defaultValue 'weasyprint' (assumes it's in PATH)
   */
  executable?: string

  /**
   * PDF version to generate (e.g., '1.7', '2.0').
   * @defaultValue weasyprint's default
   */
  pdfVersion?: string

  /**
   * Whether to optimize the PDF for size.
   * @defaultValue false
   */
  optimizeSize?: boolean

  /**
   * DPI for images.
   * @defaultValue weasyprint's default (96)
   */
  dpi?: string

  /**
   * Base URL for relative URLs in the HTML.
   */
  baseUrl?: string
}

let weasyprintAvailable: boolean | undefined

const checkWeasyprintInstallation = async (executable: string) => {
  try {
    const { stdout } = await $`${executable} --version`
    const version = /\d+\.\d+/.exec(stdout.trim())?.[0]

    // WeasyPrint < 60 has known bugs with column layouts and some HTML structures
    if (version && parseFloat(version) < 60) {
      console.warn(
        `Warning: WeasyPrint ${version} detected. Version 60+ recommended for better stability.\n` +
          `  To upgrade: pip install --upgrade weasyprint\n`,
      )
    }
  } catch (_) {
    throw new Error(
      `WeasyPrint is not installed or not available in PATH.\n\n` +
        `To install WeasyPrint:\n` +
        `  - pip:     pip install weasyprint\n` +
        `  - macOS:   brew install weasyprint\n` +
        `  - Ubuntu:  apt install weasyprint  (may be outdated, pip recommended)\n\n` +
        `See https://doc.courtbouillon.org/weasyprint/stable/first_steps.html for more options.`,
    )
  }
}

const assertWeasyprintAvailable = async (executable: string) => {
  if (weasyprintAvailable === undefined) {
    await checkWeasyprintInstallation(executable)
    weasyprintAvailable = true
  }
}

/**
 * Creates a WeasyPrint-based PDF renderer.
 *
 * WeasyPrint is a free, open-source HTML to PDF converter that supports modern CSS including
 * CSS Paged Media for print layouts. It must be installed separately on the system.
 *
 * @see https://weasyprint.org/
 */
export const makeWeasyprintRenderer =
  (options: WeasyprintOptions = {}): DocumentRendererFn =>
  async (html) => {
    const executable = options.executable ?? 'weasyprint'

    await assertWeasyprintAvailable(executable)

    // Create a temp directory for input/output files
    const tempDir = await mkdtemp(join(tmpdir(), 'bookify-weasyprint-'))

    try {
      const inputPath = join(tempDir, 'input.html')
      const outputPath = join(tempDir, 'output.pdf')

      // Write HTML to temp file
      await writeFile(inputPath, html, 'utf-8')

      // Build weasyprint arguments
      const args: string[] = []

      if (options.pdfVersion) {
        args.push('--pdf-version', options.pdfVersion)
      }

      if (options.optimizeSize) {
        args.push('--optimize-size', 'all')
      }

      if (options.dpi) {
        args.push('--dpi', options.dpi)
      }

      if (options.baseUrl) {
        args.push('--base-url', options.baseUrl)
      }

      // Run weasyprint
      try {
        await $({ reject: true })`${executable} ${args} ${inputPath} ${outputPath}`
      } catch (error: unknown) {
        // Provide more helpful error message with weasyprint output
        const execaError = error as { stderr?: string; stdout?: string; message?: string }
        const stderr = execaError.stderr ?? ''
        const stdout = execaError.stdout ?? ''

        // Check for known WeasyPrint bugs
        let additionalHelp = ''
        if (stderr.includes('IndexError') || stderr.includes('tuple index out of range')) {
          additionalHelp =
            `\nThis looks like a known bug in older WeasyPrint versions (< 60).\n` +
            `Your version may not support:\n` +
            `  - CSS multi-column layouts (column-count, column-span)\n` +
            `  - Certain complex HTML structures\n\n` +
            `To fix: Upgrade WeasyPrint to version 60+\n` +
            `  pip install --upgrade weasyprint\n\n` +
            `Or: Remove column-based CSS from your stylesheets\n`
        }

        throw new Error(
          `WeasyPrint failed to generate PDF.\n\n` +
            `Common causes:\n` +
            `  - Unsupported CSS properties (WeasyPrint supports CSS2.1 and some CSS3)\n` +
            `  - Invalid HTML structure\n` +
            `  - Missing fonts or resources\n` +
            `  - Outdated WeasyPrint version (< 60)\n\n` +
            `WeasyPrint output:\n${stderr}\n${stdout}` +
            additionalHelp,
          { cause: error },
        )
      }

      // Read and return the PDF
      const pdfBuffer = await readFile(outputPath)
      return pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    } finally {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true })
    }
  }
