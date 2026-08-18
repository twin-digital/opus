import { useQuery } from '@tanstack/react-query'

import { api } from './api'
import { toApiError } from './api-error'

/**
 * The folders an Account holds, so that wherever grinbox asks the user to name
 * a folder it offers the ones the Account actually has (r-e40s6olu).
 *
 * A name is the user's, matched against the server's listing character for
 * character (d-k8va629q): nothing here trims, case-folds, sorts by, or reads a
 * hierarchy into a separator (d-axa16o94). The listing arrives in the server's
 * own order and is offered in it.
 */

/** One folder an Account holds: its name, and the roles the server advertises. */
export interface AccountFolder {
  readonly name: string
  readonly roles: readonly string[]
}

export const accountFoldersKey = (accountId: number) => ['accounts', accountId, 'folders'] as const

/**
 * List one Account's folders. Disabled while `accountId` is null — the folder
 * pickers mount before an Account is chosen. A deployment that cannot look
 * answers with a structured refusal, which surfaces as the query's error and
 * leaves the field usable: a name the listing does not hold is accepted anyway
 * (d-mehrbfcx).
 */
export function useAccountFolders(accountId: number | null) {
  return useQuery({
    queryKey: accountFoldersKey(accountId ?? 0),
    enabled: accountId !== null,
    queryFn: async (): Promise<AccountFolder[]> => {
      const res = await api.api.accounts[':id'].folders.$get({
        param: { id: String(accountId) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { folders } = await res.json()
      return folders.map((folder) => ({ name: folder.name, roles: folder.roles }))
    },
  })
}
