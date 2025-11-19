/**
 * A minimal document storage API.
 */
export interface Repository<T extends object> {
  /**
   * Given the ID of an object, deletes the object from the repository. Will silently do nothing if
   * the specified ID does not exist.
   */
  delete: (id: string) => Promise<void>

  /**
   * Given the ID of an object, return the object's data.
   *
   * @param id id of the object to get
   * @returns the object, or null if no object exists with the given ID
   */
  get: (id: string) => Promise<T | null>

  /**
   * Returns all objects in this repository.
   */
  list: () => Promise<T[]>

  /**
   * Stores an object in the database, given its ID and data. If an object with the given ID exists, it
   * will be overwritten with the new data. Otherwise, a new object is created.
   */
  upsert: (id: string, data: T) => Promise<void>
}
