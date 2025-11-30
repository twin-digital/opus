import forEach from 'lodash-es/forEach.js'

/**
 * Generator used to create one or more series of IIDs (internal IDs, or incrementing IDs) for an entity.
 */
export class IidGenerator {
  private _nextIids: Map<string, number> = new Map<string, number>()

  /**
   * Retrieves the next IID for the sequence with the given key.
   */
  public next(key: string): number {
    const current = this._nextIids.get(key) ?? 1
    this._nextIids.set(key, current + 1)
    return current
  }

  /**
   * Loads the set of next IIDs from a serialized state.
   */
  public fromJSON(state: Record<string, number>): void {
    this._nextIids.clear()

    forEach(state, (nextIid, key) => {
      this._nextIids.set(key, nextIid)
    })
  }

  /**
   * Serializes the set of next IIDs to a JSON object.
   */
  public toJSON(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [key, nextIid] of this._nextIids) {
      result[key] = nextIid
    }

    return result
  }
}
