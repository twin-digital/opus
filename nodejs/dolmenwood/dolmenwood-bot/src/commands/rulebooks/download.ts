import { Command, Flags } from '@oclif/core'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'

interface S3Object {
  Key?: string
  ETag?: string
  Size?: number
}

export default class Download extends Command {
  static override description = 'Download PDF rulebooks from S3'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --bucket my-bucket',
    '<%= config.bin %> <%= command.id %> --bucket my-bucket --prefix rulebooks/',
    '<%= config.bin %> <%= command.id %> --bucket my-bucket --output ./custom/path',
  ]

  static override flags = {
    bucket: Flags.string({
      char: 'b',
      description: 'S3 bucket name containing rulebooks',
      required: true,
    }),
    prefix: Flags.string({
      char: 'p',
      description: 'S3 object key prefix to filter objects',
      default: '',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Directory to store downloaded rulebooks',
      default: '.data/rulebooks',
    }),
    region: Flags.string({
      description: 'AWS region for S3 bucket',
      default: 'us-east-1',
      env: 'AWS_REGION',
    }),
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })
      stream.on('error', reject)
    })
  }

  private async streamToFile(stream: Readable, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath)
      stream.pipe(writeStream)
      stream.on('error', reject)
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }

  private normalizeETag(etag?: string): string {
    if (!etag) {
      return ''
    }
    // Remove quotes from ETag if present
    return etag.replace(/^"|"$/g, '')
  }

  private async shouldDownload(localPath: string, s3ETag: string, s3Size?: number): Promise<boolean> {
    // If file doesn't exist, download it
    if (!fs.existsSync(localPath)) {
      return true
    }

    // Check file size if available
    if (s3Size !== undefined) {
      const stats = fs.statSync(localPath)
      if (stats.size !== s3Size) {
        return true
      }
    }

    // For simple ETags (non-multipart), compare MD5 hash
    // Multipart ETags contain a dash (e.g., "abc123-2")
    const normalizedETag = this.normalizeETag(s3ETag)
    if (!normalizedETag.includes('-')) {
      const localHash = await this.calculateFileHash(localPath)
      if (localHash !== normalizedETag) {
        return true
      }
    }

    // File exists and appears valid
    return false
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Download)

    const outputDir = path.resolve(flags.output)

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
      this.log(`Created output directory: ${outputDir}`)
    }

    // Initialize S3 client
    const s3Client = new S3Client({ region: flags.region })

    this.log(`Listing objects from s3://${flags.bucket}/${flags.prefix}`)

    // List objects in S3 bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: flags.bucket,
      Prefix: flags.prefix,
    })

    const response = await s3Client.send(listCommand)

    if (!response.Contents || response.Contents.length === 0) {
      this.warn(`No objects found in s3://${flags.bucket}/${flags.prefix}`)
      return
    }

    // Filter for PDF files
    const pdfObjects = response.Contents.filter((obj: S3Object) => obj.Key?.toLowerCase().endsWith('.pdf'))

    if (pdfObjects.length === 0) {
      this.warn('No PDF files found')
      return
    }

    this.log(`Found ${pdfObjects.length} PDF file(s)`)

    let downloadedCount = 0
    let skippedCount = 0

    // Download each PDF
    for (const obj of pdfObjects) {
      if (!obj.Key) {
        continue
      }

      // Extract filename from key (remove prefix if any)
      const filename = path.basename(obj.Key)
      const localPath = path.join(outputDir, filename)

      // Check if we need to download
      const needsDownload = await this.shouldDownload(localPath, obj.ETag ?? '', obj.Size)

      if (!needsDownload) {
        this.log(`✓ Skipping ${filename} (already exists and is valid)`)
        skippedCount++
        continue
      }

      this.log(`Downloading ${filename}...`)

      try {
        const getCommand = new GetObjectCommand({
          Bucket: flags.bucket,
          Key: obj.Key,
        })

        const { Body } = await s3Client.send(getCommand)

        if (!Body) {
          this.warn(`No body returned for ${filename}`)
          continue
        }

        // Stream to file
        await this.streamToFile(Body as Readable, localPath)

        this.log(`✓ Downloaded ${filename}`)
        downloadedCount++
      } catch (error) {
        const err = error as Error
        this.error(`Failed to download ${filename}: ${err.message}`)
      }
    }

    this.log(`\n✓ Complete: ${downloadedCount} downloaded, ${skippedCount} skipped, ${pdfObjects.length} total`)
  }
}
