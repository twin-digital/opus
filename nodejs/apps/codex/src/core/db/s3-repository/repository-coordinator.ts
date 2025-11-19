import type { Repository } from '../repository.js'
import { MemoryRepository } from './memory-repository.js'
import { DocumentStore } from './document-store.js'
import type { Logger } from '../../log.js'
import { consoleLogger } from '../../log.js'
import type { RepositoryFactory } from '../repository-factory.js'

type EntityKey = string

interface CoordinatorConfig {
  /**
   * Name of the S3 bucket in which to save data.
   */
  bucket: string

  /**
   * ID of the document in which the data will be saved. Combined with 'prefix' to form the S3 key.
   */
  documentId: string

  /**
   * Amount of time, in ms, to debounce writes to S3.
   */
  saveDebounceMs?: number

  /**
   * Logger to which messages are sent.
   */
  log?: Logger

  /**
   * S3 prefix in which to store the document.
   */
  prefix?: string
}

/**
 * Coordinates multiple repositories backed by a single S3 JSON document.
 *
 * - All entity types are stored in one document with top-level keys for each type
 * - Application code uses typed Repository interfaces, unaware of shared storage
 * - Changes are debounced and persisted to S3 after a configurable delay
 * - Call flush() before shutdown to ensure pending changes are saved
 */
export class RepositoryCoordinator implements RepositoryFactory {
  private _dirty = false
  private _documentId: string
  private _log: Logger
  private _repositories = new Map<EntityKey, MemoryRepository<object>>()
  private _saveDebounceMs: number
  private _saveTimer?: NodeJS.Timeout
  private _store: DocumentStore<Record<EntityKey, object>>

  public constructor(config: CoordinatorConfig) {
    this._documentId = config.documentId
    this._store = new DocumentStore(config.bucket, {
      prefix: config.prefix ?? '',
      log: config.log,
    })
    this._saveDebounceMs = config.saveDebounceMs ?? 1000
    this._log = config.log ?? consoleLogger
  }

  /**
   * Load the entire document from S3 and populate all repositories.
   * Must be called before using getRepository().
   */
  public async init(): Promise<void> {
    this._log.info('[RepositoryCoordinator] Loading document from S3')
    const doc = await this._store.load(this._documentId)

    // Pre-populate all known entity types from the document
    for (const [key, records] of Object.entries(doc)) {
      if (typeof records === 'object' && !Array.isArray(records)) {
        const map = new Map(Object.entries(records as Record<string, object>))
        this._repositories.set(key, new MemoryRepository(map))
        this._log.info(`[RepositoryCoordinator] Loaded ${map.size} records for entity type: ${key}`)
      }
    }

    this._registerShutdownHooks()

    this._log.info('[RepositoryCoordinator] Initialization complete')
  }

  /**
   * Get a repository for a specific entity type. Creates an empty repository
   * if one doesn't exist yet for this entity key.
   *
   * @param entityKey Top-level key in the document (e.g., 'players', 'characters')
   * @returns Repository instance that triggers saves on mutations
   */
  public getRepository<T extends object>(entityKey: EntityKey): Repository<T> {
    if (!this._repositories.has(entityKey)) {
      this._log.info(`[RepositoryCoordinator] Creating new repository for entity type: ${entityKey}`)
      this._repositories.set(entityKey, new MemoryRepository<T>())
    }

    const repo = this._repositories.get(entityKey)
    if (!repo) {
      throw new Error(`[RepositoryCoordinator] Repository not found for entity type: ${entityKey}`)
    }

    // Wrap the repository to intercept mutations and trigger saves
    return this._wrapRepository<T>(repo as MemoryRepository<T>)
  }

  /**
   * Force an immediate save, bypassing debounce timer.
   * Call this before shutdown to ensure all changes are persisted.
   */
  public async flush(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = undefined
    }
    await this._save()
  }

  /**
   * Wrap a repository to intercept mutations and trigger debounced saves.
   * Read operations pass through unchanged.
   */
  private _wrapRepository<T extends object>(repo: MemoryRepository<T>): Repository<T> {
    return {
      get: (id: string) => repo.get(id),
      list: () => repo.list(),

      delete: async (id: string) => {
        await repo.delete(id)
        this._markDirty()
      },

      upsert: async (id: string, data: T) => {
        await repo.upsert(id, data)
        this._markDirty()
      },
    }
  }

  /**
   * Mark the coordinator as dirty and schedule a debounced save.
   * Multiple rapid changes will be batched into a single S3 write.
   */
  private _markDirty(): void {
    this._dirty = true

    // Debounce: clear existing timer and schedule new save
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
    }

    this._saveTimer = setTimeout(() => {
      void this._save().catch((err: unknown) => {
        this._log.error('[RepositoryCoordinator] Error during debounced save:', err)
      })
    }, this._saveDebounceMs)
  }

  /**
   * Serialize all repositories into a single document and save to S3.
   */
  private async _save(): Promise<void> {
    if (!this._dirty) return

    this._log.info('[RepositoryCoordinator] Saving document to S3')

    // Serialize all repositories into a single document
    const doc: Record<EntityKey, Record<string, unknown>> = {}

    for (const [key, repo] of this._repositories.entries()) {
      const items = await repo.list()

      // Convert array of items to object keyed by id
      // Assumes each item has an 'id' property
      const recordMap: Record<string, unknown> = {}
      for (const item of items) {
        const id = typeof item === 'object' && 'id' in item ? (item as { id: unknown }).id : undefined
        if (typeof id === 'string') {
          recordMap[id] = item
        } else {
          this._log.error(`[RepositoryCoordinator] Skipping item without valid id in entity type: ${key}`, item)
        }
      }

      doc[key] = recordMap
    }

    await this._store.save(this._documentId, doc)
    this._dirty = false
    this._log.info('[RepositoryCoordinator] Save complete')
  }

  private _registerShutdownHooks() {
    // Setup graceful shutdown to flush pending saves
    const shutdown = async () => {
      this._log.info('[RepositoryCoordinator] Saving changes before shutdown...')
      await this.flush()
      this._log.info('[RepositoryCoordinator] All changes saved. Goodbye!')
      process.exit(0)
    }

    process.on('SIGTERM', () => {
      void shutdown()
    })
    process.on('SIGINT', () => {
      void shutdown()
    })
  }
}
