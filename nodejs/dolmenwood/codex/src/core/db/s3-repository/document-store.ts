import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import get from 'lodash-es/get.js'
import { consoleLogger, type Logger } from '../../log.js'

const s3 = new S3Client({ region: process.env.AWS_REGION })

export class DocumentStore<T extends Record<string, unknown>> {
  private _log: Logger
  private _prefix: string

  public constructor(
    private _bucket: string,
    { log = consoleLogger, prefix = '' }: { log?: Logger; prefix?: string } = {},
  ) {
    this._log = log
    this._prefix = prefix
  }

  /**
   * ID of the document to load
   * @param id ID
   * @returns
   */
  public async load(id: string): Promise<T> {
    const key = `${this._prefix}${id}.json`

    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: this._bucket, Key: key }))
      const json = (await res.Body?.transformToString()) ?? '{}'
      return JSON.parse(json) as T
    } catch (err: unknown) {
      const obj = err as Record<string, unknown>
      const name = get(obj, 'name') as string | undefined
      const httpStatusCode = get(obj, '$metadata.httpStatusCode') as number | undefined

      if (name !== 'NoSuchKey' && httpStatusCode !== 404) {
        this._log.error(`[DocumentStore] load failed. [id=${id}, prefix=${this._prefix}]`, err)
      }

      // no data, just return empty object
      return {} as T
    }
  }

  public async save(id: string, data: T): Promise<void> {
    const key = `${this._prefix}${id}.json`

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: this._bucket,
          Key: key,
          Body: JSON.stringify(data),
          ContentType: 'application/json',
        }),
      )
    } catch (err) {
      this._log.error(`[DocumentStore] save failed. [id=${id}, prefix=${this._prefix}]`, err)
    }
  }
}
