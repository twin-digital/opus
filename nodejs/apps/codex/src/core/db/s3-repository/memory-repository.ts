import type { Repository } from '../repository.js'

/**
 * Repository implementation that is backed by an in-memory map associating record IDs with values.
 */
export class MemoryRepository<T extends object> implements Repository<T> {
  public constructor(private _data: Map<string, T> = new Map<string, T>()) {}

  public delete(id: string): Promise<void> {
    this._data.delete(id)
    return Promise.resolve()
  }

  public get(id: string): Promise<T | null> {
    const value = this._data.get(id)
    return Promise.resolve(value ?? null)
  }

  public list(): Promise<T[]> {
    return Promise.resolve(Array.from(this._data.values()))
  }

  public upsert(id: string, data: T): Promise<void> {
    this._data.set(id, data)
    return Promise.resolve()
  }
}
