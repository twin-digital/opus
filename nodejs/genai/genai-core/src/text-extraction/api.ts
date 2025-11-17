export interface DataSource {
  /**
   * Data, as an array of bytes.
   */
  data: Uint8Array

  /**
   * MIME type of the data, if known.
   */
  mimeType?: string
}

export interface TextContent {
  metadata: Record<string, any>
  text: string
}

/**
 * Strategy for objects which can extract text from a data source, such as a PDF, text document, etc.
 */
export interface TextExtractor {
  /**
   * Extracts text from the given data source.
   *
   * @param source The data source to extract text from
   * @returns The extracted text
   * @throws Error if the source cannot be handled (should not happen if supports returned true)
   */
  extract(source: DataSource): Promise<TextContent[]>

  /**
   * Checks if this extractor can handle the given data source.
   *
   * @param source The data source to check
   * @returns true if this extractor can handle the source, false otherwise
   */
  supports(source: DataSource): boolean | Promise<boolean>
}
