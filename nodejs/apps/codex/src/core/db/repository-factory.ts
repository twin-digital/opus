import type { Repository } from './repository.js'

export interface RepositoryFactory {
  /**
   * Gets a repository for the specified entity type. Will throw an error if no such repository is available.
   * @param entityType
   */
  getRepository<T extends object>(entityType: string): Repository<T>
}
