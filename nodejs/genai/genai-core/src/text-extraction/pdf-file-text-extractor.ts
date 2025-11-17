import type { DataSource, TextExtractor } from './api.js'

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

const loadPdfjs = (): Promise<PdfjsModule> => {
  try {
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.message.includes('Cannot find module')) {
      throw new Error(
        'pdfjs-dist is required for PDF extraction. Install it with: pnpm add pdfjs-dist',
      )
    }
    throw error
  }
}

/**
 * Extracts text from PDF files using pdfjs-dist.
 *
 * Supports detection via:
 * - MIME type: application/pdf
 * - Magic bytes: PDF files start with %PDF-
 */
export class PdfFileTextExtractor implements TextExtractor {
  public supports(source: DataSource): boolean {
    // Check MIME type first
    if (source.mimeType === 'application/pdf') {
      return true
    }

    // Fallback to magic bytes detection
    // PDF files start with %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (source.data.length >= 5) {
      return (
        source.data[0] === 0x25 && // %
        source.data[1] === 0x50 && // P
        source.data[2] === 0x44 && // D
        source.data[3] === 0x46 && // F
        source.data[4] === 0x2d // -
      )
    }

    return false
  }

  public async extract(source: DataSource): Promise<string> {
    if (!this.supports(source)) {
      throw new Error(
        `PdfFileTextExtractor does not support MIME type: ${source.mimeType ?? 'undefined'}`,
      )
    }

    // Dynamic import with type safety
    const { getDocument } = await loadPdfjs()

    // Load the PDF document
    const pdf = await getDocument({
      data: source.data,
      // Disable worker to avoid Node.js worker issues
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise

    try {
      const textParts: string[] = []

      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        // Concatenate text items from the page
        const pageText = textContent.items
          .map((item) => {
            if (typeof item === 'object' && 'str' in item) {
              return String(item.str)
            }
            return ''
          })
          .join(' ')
          .replace(/\s+\n/g, '\n')
          .trim()

        textParts.push(pageText)

        // Clean up page resources
        page.cleanup()
      }

      return textParts.join('\n\n')
    } finally {
      // Clean up document resources
      await pdf.destroy()
    }
  }
}
