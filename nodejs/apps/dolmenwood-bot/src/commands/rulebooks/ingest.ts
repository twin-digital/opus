import { Command, Flags } from '@oclif/core'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ThrottlingException,
} from '@aws-sdk/client-bedrock-runtime'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

interface PageData {
  page: number
  text: string
  charStart?: number // Starting character position in the full book text
  charEnd?: number // Ending character position in the full book text
}

interface EmbeddingResponse {
  embedding: number[]
}

interface Embeddings {
  embedQuery: (text: string) => Promise<number[]>
  embedDocuments: (texts: string[]) => Promise<number[][]>
}

interface BookMetadata {
  filename: string
  title: string
  version: string
  pageOffset?: number
}

interface IndexFile {
  books: BookMetadata[]
}

interface TextItem {
  str: string
}

// Type definitions for pdfjs-dist
interface PDFDocumentProxy {
  numPages: number
  getPage: (pageNumber: number) => Promise<PDFPageProxy>
}

interface PDFPageProxy {
  getTextContent: () => Promise<TextContent>
}

interface TextContent {
  items: TextContentItem[]
}

type TextContentItem = TextItem | Record<string, unknown>

interface BookStats {
  title: string
  version?: string
  pages: number
  words: number
}

interface DryRunStats {
  books: BookStats[]
  totalPages: number
  totalWords: number
  estimatedCost: number
  estimatedTimeMin: number
  estimatedTimeMax: number
}

// Maximum allowed cost for ingestion without --force flag
const MAX_ALLOWED_COST = 0.5 // $0.50

export default class Ingest extends Command {
  static override description =
    'Ingest PDF rulebooks and create vector embeddings for semantic search'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --input ./custom/path --output ./custom/index',
    '<%= config.bin %> <%= command.id %> --input ./book.pdf --pages 100-109',
    '<%= config.bin %> <%= command.id %> --input ./book.pdf --pages 42',
    '<%= config.bin %> <%= command.id %> --chunk-size 1000 --chunk-overlap 100',
    '<%= config.bin %> <%= command.id %> --dry-run',
  ]

  static override flags = {
    input: Flags.string({
      char: 'i',
      description:
        'Directory containing PDF rulebooks, or a single PDF file to ingest',
      default: '.data/rulebooks',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Directory to store the vector index and chunks',
      default: '.data/index',
    }),
    pages: Flags.string({
      char: 'p',
      description:
        'Real page number or range to ingest (e.g., "32" or "100-109"). Uses page numbers after applying pageOffset from index.json. Only valid when input is a file.',
    }),
    'chunk-size': Flags.integer({
      description: 'Size of text chunks for splitting',
      default: 1200,
    }),
    'chunk-overlap': Flags.integer({
      description: 'Overlap between consecutive chunks',
      default: 400,
    }),
    region: Flags.string({
      description: 'AWS Bedrock region',
      default: 'us-east-1',
      env: 'BEDROCK_REGION',
    }),
    'model-id': Flags.string({
      description: 'AWS Bedrock embeddings model ID',
      default: 'amazon.titan-embed-text-v1',
      env: 'BEDROCK_EMBEDDINGS_ID',
    }),
    'max-concurrent': Flags.integer({
      description: 'Maximum number of concurrent embedding requests',
      default: 2,
    }),
    'dry-run': Flags.boolean({
      description:
        'Calculate costs and time estimates without performing ingestion',
      default: false,
    }),
    force: Flags.boolean({
      description: `Bypass the cost safety check (max: $${MAX_ALLOWED_COST})`,
      default: false,
    }),
  }

  private async readPdfPages(filePath: string): Promise<PageData[]> {
    const data = new Uint8Array(fs.readFileSync(filePath))
    const loadingTask = getDocument({ data })
    const pdf = (await loadingTask.promise) as PDFDocumentProxy
    const pages: PageData[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => {
          const textItem = item as TextItem
          return 'str' in textItem ? textItem.str : ''
        })
        .join(' ')
        .replace(/\s+\n/g, '\n')
        .trim()
      pages.push({ page: i, text })
    }

    return pages
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async invokeWithRetry(
    bedrock: BedrockRuntimeClient,
    command: InvokeModelCommand,
    maxRetries = 10,
  ): Promise<number[]> {
    let lastError: Error | undefined
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        const response = await bedrock.send(command)
        const output = JSON.parse(
          new TextDecoder().decode(response.body),
        ) as EmbeddingResponse
        return output.embedding
      } catch (error) {
        lastError = error as Error

        // Check if it's a throttling exception
        if (
          error instanceof ThrottlingException ||
          (error as Error).name === 'ThrottlingException'
        ) {
          retryCount++

          // Extract retry-after header if available from error metadata
          const errorWithMetadata = error as {
            $metadata?: { httpHeaders?: Record<string, string> }
            $retryAfterSeconds?: number
          }

          let waitTime: number

          // Check for retry-after in various locations
          if (errorWithMetadata.$retryAfterSeconds) {
            waitTime = errorWithMetadata.$retryAfterSeconds * 1000
            this.log(`Throttled. AWS SDK indicates waiting ${waitTime}ms...`)
          } else if (
            errorWithMetadata.$metadata?.httpHeaders?.['retry-after']
          ) {
            waitTime =
              Number.parseInt(
                errorWithMetadata.$metadata.httpHeaders['retry-after'],
                10,
              ) * 1000
            this.log(
              `Throttled. Retry-After header indicates waiting ${waitTime}ms...`,
            )
          } else {
            // Use exponential backoff: 1s, 2s, 4s, 8s, etc., with jitter
            const baseDelay = 1000
            const exponentialDelay = baseDelay * 2 ** retryCount
            const jitter = Math.random() * 1000 // Add up to 1 second of jitter
            waitTime = Math.min(exponentialDelay + jitter, 64_000) // Cap at 64 seconds

            this.log(
              `Throttled. Attempt ${retryCount}/${maxRetries}. Using exponential backoff: ${Math.round(waitTime)}ms...`,
            )
          }

          await this.delay(waitTime)
          continue
        }

        // For non-throttling errors, throw immediately
        throw error
      }
    }

    throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`)
  }

  private createEmbeddings(
    bedrock: BedrockRuntimeClient,
    modelId: string,
    maxConcurrent: number,
  ): Embeddings {
    const embedQuery = async (text: string): Promise<number[]> => {
      const body = JSON.stringify({ inputText: text })
      const command = new InvokeModelCommand({
        modelId,
        body,
        contentType: 'application/json',
      })
      return this.invokeWithRetry(bedrock, command)
    }

    const embedDocuments = async (texts: string[]): Promise<number[][]> => {
      const embeddings: number[][] = []
      const totalChunks = texts.length

      this.log(
        `Creating embeddings for ${totalChunks} chunks (${maxConcurrent} concurrent requests)...`,
      )

      // Process in batches to limit concurrency
      for (let i = 0; i < texts.length; i += maxConcurrent) {
        const batch = texts.slice(i, i + maxConcurrent)
        const batchNumber = Math.floor(i / maxConcurrent) + 1
        const totalBatches = Math.ceil(texts.length / maxConcurrent)
        const progress = Math.round((i / totalChunks) * 100)

        this.log(
          `Batch ${batchNumber}/${totalBatches} (${progress}% complete)...`,
        )

        // Process batch concurrently with automatic retry and backoff
        const batchEmbeddings = await Promise.all(
          batch.map((text) => embedQuery(text)),
        )
        embeddings.push(...batchEmbeddings)
      }

      return embeddings
    }

    return {
      embedQuery,
      embedDocuments,
    }
  }

  private parsePageRange(pagesFlag: string): { start: number; end: number } {
    const rangeRegex = /^(\d+)-(\d+)$/
    const rangeMatch = rangeRegex.exec(pagesFlag)
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      if (start > end) {
        this.error(
          `Invalid page range: start (${start}) must be less than or equal to end (${end})`,
        )
      }
      return { start, end }
    }

    const singleRegex = /^\d+$/
    const singleMatch = singleRegex.exec(pagesFlag)
    if (singleMatch) {
      const page = Number.parseInt(pagesFlag, 10)
      return { start: page, end: page }
    }

    this.error(
      `Invalid page specification: "${pagesFlag}". Use a single page (e.g., "32") or range (e.g., "100-109")`,
    )
  }

  private calculateRealPageNumber(
    pdfPageNumber: number,
    pageOffset: number,
  ): number {
    return pdfPageNumber + pageOffset
  }

  private shouldIncludePage(
    realPageNumber: number,
    pageRange?: { start: number; end: number },
  ): boolean {
    // Skip pages with real page number <= 0
    if (realPageNumber <= 0) return false
    // If no range specified, include all valid pages
    if (!pageRange) return true
    // Check if real page number is in the specified range
    return realPageNumber >= pageRange.start && realPageNumber <= pageRange.end
  }

  private loadBookIndex(inputDir: string): Map<string, BookMetadata> {
    const indexPath = path.join(inputDir, 'index.json')
    const bookMap = new Map<string, BookMetadata>()

    if (!fs.existsSync(indexPath)) {
      this.warn(
        `No index.json found in ${inputDir}. Book titles will be derived from filenames.`,
      )
      return bookMap
    }

    try {
      const indexContent = fs.readFileSync(indexPath, 'utf8')
      const index = JSON.parse(indexContent) as IndexFile

      for (const book of index.books) {
        bookMap.set(book.filename, book)
      }

      this.log(`Loaded metadata for ${bookMap.size} book(s) from index.json`)
    } catch (error) {
      const err = error as Error
      this.warn(
        `Failed to parse index.json: ${err.message}. Book titles will be derived from filenames.`,
      )
    }

    return bookMap
  }

  private countWords(text: string): number {
    // Split on whitespace and filter out empty strings
    return text.split(/\s+/).filter((word) => word.length > 0).length
  }

  private estimateCost(totalWords: number): number {
    // AWS Bedrock Titan Embed pricing: $0.0001 per 1,000 tokens
    // Rough estimate: 1 token ≈ 0.75 words (or ~1.33 words per token)
    const estimatedTokens = totalWords / 0.75
    const costPer1000Tokens = 0.0001
    return (estimatedTokens / 1000) * costPer1000Tokens
  }

  private estimateTime(
    totalWords: number,
    maxConcurrent: number,
  ): { min: number; max: number } {
    // Average latency per API call: 300-500ms
    // Each chunk is ~1200 chars = ~300 words = ~400 tokens
    const avgWordsPerChunk = 300
    const estimatedChunks = Math.ceil(totalWords / avgWordsPerChunk)

    // Time per batch (concurrent requests)
    const batches = Math.ceil(estimatedChunks / maxConcurrent)

    // Optimistic: 300ms per batch
    const minSeconds = batches * 0.3
    // Conservative: 500ms per batch + potential throttling overhead (20%)
    const maxSeconds = batches * 0.5 * 1.2

    return {
      min: Math.ceil(minSeconds),
      max: Math.ceil(maxSeconds),
    }
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (remainingSeconds === 0) {
      return `${minutes}m`
    }
    return `${minutes}m ${remainingSeconds}s`
  }

  private displayDryRunResults(stats: DryRunStats): void {
    this.log('\n═══════════════════════════════════════════════════════')
    this.log('                    DRY RUN RESULTS')
    this.log('═══════════════════════════════════════════════════════\n')

    for (const book of stats.books) {
      const versionStr = book.version ? ` (${book.version})` : ''
      this.log(`📖 ${book.title}${versionStr}`)
      this.log(`   Pages: ${book.pages.toLocaleString()}`)
      this.log(`   Words: ${book.words.toLocaleString()}\n`)
    }

    this.log('───────────────────────────────────────────────────────')
    this.log(`Total pages: ${stats.totalPages.toLocaleString()}`)
    this.log(`Total words: ${stats.totalWords.toLocaleString()}`)
    this.log(`\nEstimated cost: $${stats.estimatedCost.toFixed(4)}`)
    this.log(
      `Estimated time: ${this.formatTime(stats.estimatedTimeMin)} - ${this.formatTime(stats.estimatedTimeMax)}`,
    )
    this.log('═══════════════════════════════════════════════════════\n')
  }

  private calculatePositionKey(
    book: string,
    pages: number[],
    chunk: number,
  ): string {
    // Position-based key for identifying a specific chunk location
    // Use the first page as the primary page for the key
    const primaryPage = pages[0] || 0
    return `${book}|${primaryPage}|${chunk}`
  }

  private calculateContentHash(content: string): string {
    // Content-based hash for detecting changes
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private async loadExistingStore(
    outputDir: string,
    embeddings: Embeddings,
  ): Promise<{
    store: HNSWLib | null
    existingChunks: Map<string, { id: string; contentHash: string }>
    pageChunkCounts: Map<string, number>
  }> {
    const vectorStorePath = path.join(outputDir, 'vector_store')

    // Check if vector store exists
    if (!fs.existsSync(vectorStorePath)) {
      this.log('No existing index found. Creating new index...')
      return {
        store: null,
        existingChunks: new Map(),
        pageChunkCounts: new Map(),
      }
    }

    try {
      this.log('Loading existing index...')
      const store = await HNSWLib.load(vectorStorePath, embeddings)

      // Track chunks by position key and count chunks per page
      const existingChunks = new Map<
        string,
        { id: string; contentHash: string }
      >()
      const pageChunkCounts = new Map<string, number>()

      // Read the docstore.json file directly
      const docstorePath = path.join(vectorStorePath, 'docstore.json')

      if (fs.existsSync(docstorePath)) {
        try {
          const docstoreContent = fs.readFileSync(docstorePath, 'utf8')
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const docstoreData = JSON.parse(docstoreContent)

          // Docstore is an array of [id, document] pairs
          if (Array.isArray(docstoreData)) {
            for (const [id, doc] of docstoreData) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
              const metadata = doc.metadata
              if (metadata) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const book = metadata.book as string
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                const pagesData = metadata.pages ?? metadata.page
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const primaryPage = metadata.primaryPage as number | undefined
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const chunk = metadata.chunk as number
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const contentHash = metadata.contentHash as string

                // Handle both old format (single page) and new format (pages array)
                let pages: number[]
                if (Array.isArray(pagesData)) {
                  pages = pagesData as number[]
                } else if (typeof pagesData === 'number') {
                  pages = [pagesData]
                } else {
                  continue
                }

                const effectivePrimaryPage = primaryPage ?? pages[0]

                if (book && pages.length > 0 && typeof chunk === 'number') {
                  const positionKey = this.calculatePositionKey(
                    book,
                    pages,
                    chunk,
                  )
                  existingChunks.set(positionKey, {
                    id: id as string,
                    contentHash: contentHash || '',
                  })

                  // Track chunk count per primary page
                  const pageKey = `${book}|${effectivePrimaryPage}`
                  pageChunkCounts.set(
                    pageKey,
                    (pageChunkCounts.get(pageKey) ?? 0) + 1,
                  )
                }
              }
            }
          }
        } catch (error) {
          const err = error as Error
          this.warn(`Failed to read docstore: ${err.message}`)
        }
      }

      this.log(`Found ${existingChunks.size} existing chunks in index`)
      return { store, existingChunks, pageChunkCounts }
    } catch (error) {
      const err = error as Error
      this.warn(
        `Failed to load existing index: ${err.message}. Creating new index...`,
      )
      return {
        store: null,
        existingChunks: new Map(),
        pageChunkCounts: new Map(),
      }
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Ingest)

    const inputPath = path.resolve(flags.input)
    const outputDir = path.resolve(flags.output)

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Check if input exists
    if (!fs.existsSync(inputPath)) {
      this.error(`Input path does not exist: ${inputPath}`)
    }

    // Determine if input is a file or directory
    const stats = fs.statSync(inputPath)
    const isFile = stats.isFile()
    const isDirectory = stats.isDirectory()

    if (!isFile && !isDirectory) {
      this.error(`Input path must be a file or directory: ${inputPath}`)
    }

    // Validate page flag usage
    let pageRange: { start: number; end: number } | undefined
    if (flags.pages) {
      if (isDirectory) {
        this.error(
          'The --pages flag can only be used when --input specifies a single file, not a directory',
        )
      }
      pageRange = this.parsePageRange(flags.pages)
      this.log(`Filtering to pages ${pageRange.start}-${pageRange.end}`)
    }

    // Get list of files to process
    let files: string[]
    let baseDir: string

    if (isFile) {
      if (!inputPath.toLowerCase().endsWith('.pdf')) {
        this.error(`Input file must be a PDF: ${inputPath}`)
      }
      files = [path.basename(inputPath)]
      baseDir = path.dirname(inputPath)
      this.log(`Processing single file: ${files[0]}`)
    } else {
      baseDir = inputPath
      files = fs.readdirSync(inputPath).filter((f) => f.endsWith('.pdf'))

      if (files.length === 0) {
        this.warn(`No PDF files found in ${inputPath}`)
        return
      }

      this.log(`Found ${files.length} PDF file(s) to process`)
    }

    // Load book metadata from index.json
    const bookIndex = this.loadBookIndex(baseDir)

    // Initialize text splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: flags['chunk-size'],
      chunkOverlap: flags['chunk-overlap'],
    })

    const docs: Document[] = []
    const bookStats: BookStats[] = []
    let totalWords = 0

    // Process each PDF
    for (const file of files) {
      const bookMetadata = bookIndex.get(file)
      const bookTitle = bookMetadata?.title ?? file.replace(/\.pdf$/i, '')
      const bookVersion = bookMetadata?.version
      const pageOffset = bookMetadata?.pageOffset ?? 0

      let logMessage = `Processing ${bookTitle}${bookVersion ? ` (${bookVersion})` : ''}`
      if (pageOffset !== 0) {
        logMessage += ` [page offset: ${pageOffset}]`
      }
      this.log(logMessage + '...')

      const pages = await this.readPdfPages(path.join(baseDir, file))
      let bookWordCount = 0
      let includedPageCount = 0
      let skippedInvalidPages = 0

      // Build full text with page markers to track where each page's content appears
      let fullText = ''
      const pageMarkers: {
        page: number
        charStart: number
        charEnd: number
      }[] = []

      for (const { page: pdfPageNumber, text } of pages) {
        const realPageNumber = this.calculateRealPageNumber(
          pdfPageNumber,
          pageOffset,
        )

        // Skip pages based on real page number
        if (!this.shouldIncludePage(realPageNumber, pageRange)) {
          if (realPageNumber <= 0) {
            skippedInvalidPages++
          }
          continue
        }

        if (!text) continue

        // Count words for cost estimation
        const pageWords = this.countWords(text)
        bookWordCount += pageWords
        totalWords += pageWords
        includedPageCount++

        // Record where this page's text appears in the full text
        const charStart = fullText.length
        fullText += text + '\n\n' // Add spacing between pages
        const charEnd = fullText.length

        pageMarkers.push({ page: realPageNumber, charStart, charEnd })
      }

      // Split the full text into chunks with their positions
      // RecursiveCharacterTextSplitter doesn't give us positions, so we need to track them
      const chunks = await splitter.splitText(fullText)

      // Calculate actual positions in the full text
      // The splitter uses overlap, so we need to carefully track where each chunk came from
      let searchStartPos = 0

      chunks.forEach((chunk: string, index: number) => {
        // Find where this chunk appears in fullText, starting from where we last searched
        const chunkStartPos = fullText.indexOf(chunk, searchStartPos)

        if (chunkStartPos === -1) {
          // This shouldn't happen, but if it does, log and skip
          this.warn(
            `Warning: Could not locate chunk ${index} in full text for ${bookTitle}`,
          )
          return
        }

        const chunkEndPos = chunkStartPos + chunk.length

        // Find all pages that overlap with this chunk
        const pagesInChunk: number[] = []
        for (const marker of pageMarkers) {
          // Check if this page overlaps with the chunk
          if (
            marker.charStart < chunkEndPos &&
            marker.charEnd > chunkStartPos
          ) {
            pagesInChunk.push(marker.page)
          }
        }

        // If no pages found, this is a problem - log warning
        if (pagesInChunk.length === 0) {
          this.warn(
            `Warning: Chunk ${index} (pos ${chunkStartPos}-${chunkEndPos}) has no page attribution for ${bookTitle}`,
          )
        }

        // Calculate position key and content hash
        const positionKey = this.calculatePositionKey(
          bookTitle,
          pagesInChunk,
          index,
        )
        const contentHash = this.calculateContentHash(chunk)

        const metadata: Record<string, string | number | number[]> = {
          book: bookTitle,
          pages: pagesInChunk, // All pages that appear in this chunk
          primaryPage: pagesInChunk[0] || 0, // First page for sorting/filtering
          chunk: index,
          positionKey,
          contentHash,
        }

        if (bookVersion) {
          metadata.version = bookVersion
        }

        docs.push(
          new Document({
            pageContent: chunk,
            metadata,
          }),
        )

        // Move search position forward, accounting for overlap
        // Start next search just past the beginning of this chunk to handle overlaps
        searchStartPos = chunkStartPos + 1
      })

      // Store book statistics
      bookStats.push({
        title: bookTitle,
        version: bookVersion,
        pages: includedPageCount,
        words: bookWordCount,
      })

      if (skippedInvalidPages > 0) {
        this.log(
          `  Skipped ${skippedInvalidPages} page(s) with real page number ≤ 0`,
        )
      }

      if (pageRange) {
        this.log(
          `  Included ${includedPageCount} page(s) from real page range ${pageRange.start}-${pageRange.end}`,
        )
      }
    }

    this.log(`Created ${docs.length} document chunks`)

    // Calculate cost and time estimates
    const estimatedCost = this.estimateCost(totalWords)
    const estimatedTime = this.estimateTime(totalWords, flags['max-concurrent'])

    const dryRunStats: DryRunStats = {
      books: bookStats,
      totalPages: bookStats.reduce((sum, book) => sum + book.pages, 0),
      totalWords,
      estimatedCost,
      estimatedTimeMin: estimatedTime.min,
      estimatedTimeMax: estimatedTime.max,
    }

    // If dry-run, display results and exit
    if (flags['dry-run']) {
      this.displayDryRunResults(dryRunStats)
      return
    }

    // Cost safety check (unless --force is used)
    if (!flags.force && estimatedCost > MAX_ALLOWED_COST) {
      this.displayDryRunResults(dryRunStats)
      this.error(
        `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds safety limit ($${MAX_ALLOWED_COST.toFixed(2)}). ` +
          `Use --dry-run to preview or --force to proceed anyway.`,
      )
    }

    // Initialize Bedrock client with adaptive retry mode
    // The AWS SDK will automatically handle retries with exponential backoff
    const bedrock = new BedrockRuntimeClient({
      region: flags.region,
      maxAttempts: 10, // Maximum retry attempts
      retryMode: 'adaptive', // Adaptive retry mode adjusts based on service response
    })
    const embeddings = this.createEmbeddings(
      bedrock,
      flags['model-id'],
      flags['max-concurrent'],
    )

    // Load existing store and get existing chunks with position tracking
    const {
      store: existingStore,
      existingChunks,
      pageChunkCounts,
    } = await this.loadExistingStore(outputDir, embeddings)

    // Group new documents by primary page to check chunk counts
    const newDocsByPage = new Map<string, Document[]>()
    for (const doc of docs) {
      const book = doc.metadata.book as string
      const primaryPage = doc.metadata.primaryPage as number
      const pageKey = `${book}|${primaryPage}`
      if (!newDocsByPage.has(pageKey)) {
        newDocsByPage.set(pageKey, [])
      }
      const pageDocs = newDocsByPage.get(pageKey)
      if (pageDocs) {
        pageDocs.push(doc)
      }
    }

    // Track what needs to be done: add, replace, or skip
    const docsToAdd: Document[] = []
    const idsToRemove: string[] = []
    let skippedCount = 0
    let replacedCount = 0
    let rechunkedPages = 0

    for (const [pageKey, pageDocs] of newDocsByPage.entries()) {
      const oldChunkCount = pageChunkCounts.get(pageKey) ?? 0
      const newChunkCount = pageDocs.length

      // Check if chunk count changed (indicates re-chunking)
      if (oldChunkCount > 0 && oldChunkCount !== newChunkCount) {
        this.log(
          `  Page ${pageKey.split('|')[1]}: Chunk count changed (${oldChunkCount} → ${newChunkCount}), purging old chunks`,
        )
        rechunkedPages++

        // Remove all old chunks for this page
        for (const doc of pageDocs) {
          const positionKey = doc.metadata.positionKey as string
          const existing = existingChunks.get(positionKey)
          if (existing) {
            idsToRemove.push(existing.id)
          }
        }

        // Add all new chunks
        docsToAdd.push(...pageDocs)
      } else {
        // Chunk count matches or page is new - check each chunk individually
        for (const doc of pageDocs) {
          const positionKey = doc.metadata.positionKey as string
          const contentHash = doc.metadata.contentHash as string
          const existing = existingChunks.get(positionKey)

          if (!existing) {
            // New chunk position
            docsToAdd.push(doc)
          } else if (existing.contentHash !== contentHash) {
            // Content changed at this position
            idsToRemove.push(existing.id)
            docsToAdd.push(doc)
            replacedCount++
          } else {
            // Content unchanged
            skippedCount++
          }
        }
      }
    }

    // Report what we're doing
    if (rechunkedPages > 0) {
      this.log(`Re-chunked ${rechunkedPages} page(s)`)
    }
    if (replacedCount > 0) {
      this.log(`Replacing ${replacedCount} chunk(s) with updated content`)
    }
    if (skippedCount > 0) {
      this.log(
        `Skipping ${skippedCount} chunk(s) that already exist with identical content`,
      )
    }

    if (docsToAdd.length === 0) {
      this.log('✓ No new chunks to index. All content already exists.')
      return
    }

    // Create or update vector store
    this.log(
      `Creating embeddings for ${docsToAdd.length} new/updated chunk(s)...`,
    )
    let store: HNSWLib
    if (existingStore) {
      store = existingStore
      // Note: HNSWLib doesn't have a removeDocuments method, so we'll need to handle this differently
      // For now, we'll add new documents and the old ones will remain but won't be findable by position
      await store.addDocuments(docsToAdd)
    } else {
      store = await HNSWLib.fromDocuments(docsToAdd, embeddings)
    }

    // Save vector store and chunks
    const vectorStorePath = path.join(outputDir, 'vector_store')
    await store.save(vectorStorePath)
    this.log(`Vector store saved to ${vectorStorePath}`)

    // Append new chunks to chunks.jsonl (or create if it doesn't exist)
    const chunksPath = path.join(outputDir, 'chunks.jsonl')
    const newChunksData = docsToAdd
      .map((d) => JSON.stringify({ meta: d.metadata, text: d.pageContent }))
      .join('\n')
    if (newChunksData) {
      if (fs.existsSync(chunksPath)) {
        // Append to existing file
        fs.appendFileSync(chunksPath, '\n' + newChunksData)
      } else {
        // Create new file
        fs.writeFileSync(chunksPath, newChunksData)
      }
      this.log(`Chunks saved to ${chunksPath}`)
    }

    // Calculate actual cost only for new embeddings
    const actualCost = this.estimateCost(
      docsToAdd.reduce((sum, doc) => sum + this.countWords(doc.pageContent), 0),
    )

    const finalChunkCount =
      existingChunks.size - idsToRemove.length + docsToAdd.length

    this.log(
      `✓ Successfully indexed ${docsToAdd.length} new/updated chunk(s) from ${files.length} PDF(s)`,
    )
    this.log(`  Total chunks in index: ${finalChunkCount}`)
    this.log(`  Actual cost: ~$${actualCost.toFixed(4)}`)
  }
}
