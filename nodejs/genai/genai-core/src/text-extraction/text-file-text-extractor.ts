import type { DataSource, TextExtractor } from './api.js'

/**
 * Default MIME types supported by TextFileTextExtractor.
 * Includes common human-readable text formats (excluding structured markup formats).
 */
const DEFAULT_SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
] as const

/**
 * Extracts text from plain text files and other human-readable text formats.
 */
export class TextFileTextExtractor implements TextExtractor {
  private readonly supportedMimeTypes: Set<string>

  constructor(
    supportedMimeTypes: string[] = [...DEFAULT_SUPPORTED_MIME_TYPES],
  ) {
    this.supportedMimeTypes = new Set(supportedMimeTypes)
  }

  public supports(source: DataSource): boolean {
    return (
      source.mimeType !== undefined &&
      this.supportedMimeTypes.has(source.mimeType)
    )
  }

  public extract(source: DataSource): Promise<string> {
    if (!this.supports(source)) {
      throw new Error(
        `TextFileTextExtractor does not support MIME type: ${source.mimeType ?? 'undefined'}`,
      )
    }

    const decoder = new TextDecoder('utf-8')
    return Promise.resolve(decoder.decode(source.data))
  }
}
