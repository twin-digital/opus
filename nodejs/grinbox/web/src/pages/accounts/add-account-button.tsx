import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '../../components/ui/button.js'
import { accountsKey } from '../../lib/accounts.js'
import { type OAuthResult, runOAuthFlow } from '../../lib/oauth.js'

/**
 * "Add Account" — kicks off the Gmail OAuth pop-up flow (oauth-flow.md). On a
 * successful grant it invalidates the accounts query (the new row appears on the
 * next refetch) and toasts success. The common dev state — OAuth not configured
 * (503) — surfaces as a clear toast rather than a hang; pop-up-blocked and
 * user-cancelled outcomes are handled too.
 *
 * Shared by the list header and the empty-state CTA.
 */
export function AddAccountButton({
  variant = 'default',
  size = 'default',
}: {
  variant?: 'default' | 'outline'
  size?: 'default' | 'lg'
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)

  const onClick = async () => {
    if (pending) {
      return
    }
    setPending(true)
    try {
      const result = await runOAuthFlow()
      handleOAuthResult(result, () => {
        void qc.invalidateQueries({ queryKey: accountsKey })
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => {
        void onClick()
      }}
    >
      <Plus />
      {pending ? 'Waiting on Google…' : 'Add Account'}
    </Button>
  )
}

/**
 * Map an OAuth outcome onto a toast (and run `onSuccess` for the success
 * branch). Shared so Add Account and Re-auth render the same copy.
 */
export function handleOAuthResult(result: OAuthResult, onSuccess: () => void): void {
  switch (result.kind) {
    case 'success':
      onSuccess()
      toast.success('Account authorized', {
        description: 'Gmail access granted. Grinbox will start polling shortly.',
      })
      break
    case 'not_configured':
      toast.error('Gmail OAuth not configured', {
        description: result.message,
      })
      break
    case 'popup_blocked':
      toast.error('Pop-up blocked', {
        description: 'Allow pop-ups for Grinbox and try Add Account again to open the Google consent window.',
      })
      break
    case 'cancelled':
      toast('Authorization cancelled', {
        description: 'The consent window closed before authorization finished.',
      })
      break
    case 'error':
      toast.error("Couldn't authorize Gmail", {
        description: result.message,
      })
      break
  }
}
