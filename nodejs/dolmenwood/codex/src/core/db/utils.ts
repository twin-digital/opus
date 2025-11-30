import { merge } from 'lodash-es'
import type { Repository } from './repository.js'

export const findOrCreate = async <T extends object>(
  repository: Repository<T>,
  id: string,
  defaultValue?: T,
): Promise<T> => {
  const existing = await repository.get(id)
  const result = existing ?? {
    ...((defaultValue ?? {}) as T),
    id,
  }

  if (existing === null) {
    await repository.upsert(id, result)
  }

  return result
}

export const patchRecord = async <T extends object>(
  repository: Repository<T>,
  id: string,
  patch: Partial<T>,
): Promise<T> => {
  const original = await findOrCreate(repository, id)
  const updated = merge(original, patch) as T
  await repository.upsert(id, updated)
  return updated
}
