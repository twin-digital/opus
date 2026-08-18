import type { AccountSummary } from '@grinbox/server'
import { FOLDER_ROLES } from '@grinbox/shared'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  type ImapLogin,
  type ImapProbe,
  imapRefusalMessage,
  loginFromSettings,
  useImapProbe,
  useRepairImapConnection,
  useRepointFolders,
} from '@/lib/imap'
import { CapabilityNotice } from './add-account-button'
import {
  acceptedFolders,
  draftFromProposal,
  type FolderRoleDraft,
  FolderRoleFields,
  proposalFromFolders,
} from './folder-role-fields'
import { blankLogin, ImapConnectionFields, loginComplete } from './imap-connection-fields'

/**
 * Repairing an Account whose password the server refused (d-v4mejzw5). The user
 * restates everything an IMAP Account is configured with, not the password
 * alone (d-r3ogwkv7) — the connection, then the four folders (d-mcdtvppm) —
 * with every field but the password pre-filled from what is stored. The backend
 * is not offered: an Account keeps the one it was added with (d-oevikmal).
 *
 * Polling resumes once a working password is given, and nothing about the
 * Account is deleted (d-v4mejzw5).
 */
export function RepairImapDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AccountSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const stored = account.imap
  const [step, setStep] = useState<'connection' | 'folders'>('connection')
  const [login, setLogin] = useState<ImapLogin>(() => (stored === null ? blankLogin() : loginFromSettings(stored)))
  const [probe, setProbe] = useState<ImapProbe | null>(null)
  const [folders, setFolders] = useState<FolderRoleDraft>(() => draftFromProposal(stored?.folders ?? {}))
  const [error, setError] = useState<string | null>(null)

  const probing = useImapProbe()
  const repair = useRepairImapConnection(account.id)
  const repoint = useRepointFolders(account.id)

  const onLogIn = () => {
    setError(null)
    probing.mutate(login, {
      onSuccess: (result) => {
        setProbe(result)
        // What is stored stays the proposal on a repair: the user is fixing a
        // password, and re-pointing a folder is a separate, deliberate change.
        setFolders(draftFromProposal(stored?.folders ?? proposalFromFolders(result.folders)))
        setStep('folders')
      },
      onError: (err) => {
        setError(imapRefusalMessage(err))
      },
    })
  }

  const accepted = acceptedFolders(folders)

  // The connection and the folders are two calls: the repair route restates the
  // connection, and a role the user re-pointed on the way through goes to the
  // folders route (d-8pdx8qsd). The connection is repaired first — it is what
  // unpauses the Account.
  const onRepair = async () => {
    if (accepted === null) {
      return
    }
    setError(null)
    try {
      await repair.mutateAsync(login)
      if (stored === null || FOLDER_ROLES.some((role) => stored.folders[role] !== accepted[role])) {
        await repoint.mutateAsync(accepted)
      }
      toast.success('Account reconnected', {
        description: 'Grinbox will resume polling this mailbox.',
      })
      onOpenChange(false)
    } catch (err) {
      setError(imapRefusalMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Reconnect {account.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-6'>
          {step === 'connection' ?
            <>
              <p className='text-sm text-muted-foreground'>
                {account.paused_reason ??
                  'The server refused grinbox’s login and said the password is what it refused.'}
              </p>
              {stored === null ?
                <p className='text-xs [color:var(--warning)]'>
                  Grinbox could not read this Account’s stored connection, so these fields start empty. Restate the
                  whole connection.
                </p>
              : null}
              <ImapConnectionFields
                value={login}
                onChange={setLogin}
                passwordHint='Give grinbox a working password. The whole connection is restated, so change anything else here that moved.'
              />
            </>
          : <>
              <p className='text-sm text-muted-foreground'>
                Logged in. These are the folders this Account is set to — accept them or name others.
              </p>
              <FolderRoleFields value={folders} onChange={setFolders} folders={probe?.folders ?? []} />
              <CapabilityNotice capabilities={probe?.capabilities ?? null} />
            </>
          }

          {error ?
            <p
              role='alert'
              className='rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm [color:var(--danger)]'
            >
              {error}
            </p>
          : null}
        </DialogBody>
        <DialogFooter>
          <div />
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              onClick={() => {
                if (step === 'folders') {
                  setStep('connection')
                  return
                }
                onOpenChange(false)
              }}
            >
              {step === 'folders' ? 'Back' : 'Cancel'}
            </Button>
            {step === 'connection' ?
              <Button onClick={onLogIn} disabled={!loginComplete(login) || probing.isPending}>
                {probing.isPending ? 'Logging in…' : 'Log in'}
              </Button>
            : <Button
                onClick={() => void onRepair()}
                disabled={accepted === null || repair.isPending || repoint.isPending}
              >
                {repair.isPending || repoint.isPending ? 'Reconnecting…' : 'Reconnect'}
              </Button>
            }
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
