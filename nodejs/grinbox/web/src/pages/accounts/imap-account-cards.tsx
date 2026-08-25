import type { AccountSummary } from '@grinbox/server'
import { ACCOUNT_CAPABILITIES, FOLDER_ROLES } from '@grinbox/shared'
import { KeyRound, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CAPABILITY_LABELS, accountSupports, unsupportedReason } from '@/lib/capabilities'
import { useAccountFolders } from '@/lib/folders'
import { imapRefusalMessage, useRepointFolders } from '@/lib/imap'
import { acceptedFolders, draftFromProposal, type FolderRoleDraft, FolderRoleFields } from './folder-role-fields'
import { securityLabel } from './imap-connection-fields'
import { RepairImapDialog } from './repair-imap-dialog'

/**
 * The IMAP-specific parts of Account detail: why polling is paused and how to
 * repair it, what connection the Account is on, where its four folders point,
 * and what it can carry.
 *
 * Everything a user has to do to run grinbox is done from grinbox's own
 * interface (r-t4jn8zvw), and grinbox says what it needs rather than waiting to
 * be asked (r-x3jb6wlq).
 */

function isImap(account: AccountSummary): boolean {
  return account.provider_type === 'imap'
}

/**
 * Polling stopped and the Account needs the user (d-v4mejzw5). An IMAP Account
 * is repaired — the whole connection restated — rather than re-authorized
 * (d-hinqfmdf, d-r3ogwkv7).
 */
export function PausedBanner({ account }: { account: AccountSummary }) {
  const [repairing, setRepairing] = useState(false)
  if (account.status !== 'paused') {
    return null
  }
  return (
    <div className='flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 p-4'>
      <div className='flex items-start gap-3'>
        <TriangleAlert className='mt-0.5 h-5 w-5 shrink-0 [color:var(--warning)]' />
        <div>
          <p className='font-medium [color:var(--warning)]'>Polling is paused — this Account needs you</p>
          <p className='mt-1 max-w-xl text-sm text-muted-foreground'>
            {account.paused_reason ?? 'The mail server refused grinbox’s login and named the credential.'}{' '}
            {isImap(account) ?
              'Nothing about the Account has been deleted. Give grinbox a working connection and polling resumes.'
            : null}
          </p>
        </div>
      </div>
      {isImap(account) ?
        <>
          <Button
            variant='outline'
            onClick={() => {
              setRepairing(true)
            }}
          >
            <KeyRound />
            Reconnect
          </Button>
          {repairing ?
            <RepairImapDialog account={account} open onOpenChange={setRepairing} />
          : null}
        </>
      : null}
    </div>
  )
}

/** The connection an IMAP Account is reached on (d-ioso3voc). Never its password. */
export function ImapConnectionCard({ account }: { account: AccountSummary }) {
  const [repairing, setRepairing] = useState(false)
  const settings = account.imap
  if (!isImap(account)) {
    return null
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>
          The IMAP server this Account is read from. Changing any of it means logging in again — grinbox takes the whole
          connection at once, not the password alone.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {settings === null ?
          <p className='text-sm text-muted-foreground'>Grinbox could not read this Account’s stored connection.</p>
        : <dl className='grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]'>
            <dt className='text-muted-foreground'>Server</dt>
            <dd className='font-mono'>
              {settings.host}:{settings.port}
            </dd>
            <dt className='text-muted-foreground'>Connection</dt>
            <dd>{securityLabel(settings.security)}</dd>
            <dt className='text-muted-foreground'>Username</dt>
            <dd className='font-mono'>{settings.username}</dd>
            <dt className='text-muted-foreground'>Password</dt>
            <dd className='text-muted-foreground'>Stored encrypted. Grinbox never shows it again.</dd>
          </dl>
        }
        <Button
          variant='outline'
          onClick={() => {
            setRepairing(true)
          }}
        >
          Change connection
        </Button>
        {repairing ?
          <RepairImapDialog account={account} open onOpenChange={setRepairing} />
        : null}
      </CardContent>
    </Card>
  )
}

/**
 * Where the Account's four folders point, and re-pointing them (d-8pdx8qsd).
 * What grinbox already recorded keeps the standing it had; the new folders are
 * what the next poll and the next reconcile read.
 */
export function AccountFoldersCard({ account }: { account: AccountSummary }) {
  const settings = account.imap
  const { data: folders } = useAccountFolders(isImap(account) ? account.id : null)
  const repoint = useRepointFolders(account.id)
  const [draft, setDraft] = useState<FolderRoleDraft | null>(null)

  if (!isImap(account)) {
    return null
  }

  const stored = settings === null ? null : draftFromProposal(settings.folders)
  const value = draft ?? stored ?? draftFromProposal({})
  const accepted = acceptedFolders(value)
  const dirty = stored === null || FOLDER_ROLES.some((role) => stored[role] !== value[role])

  const onSave = () => {
    if (accepted === null) {
      return
    }
    repoint.mutate(accepted, {
      onSuccess: () => {
        setDraft(null)
        toast.success('Folders saved', {
          description: 'The next poll reads these. What grinbox already recorded keeps the standing it had.',
        })
      },
      onError: (err) => {
        toast.error('Could not save folders', { description: imapRefusalMessage(err) })
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Folders</CardTitle>
        <CardDescription>
          Which folder each role names. Grinbox creates, renames, and deletes no folder — every one of these is a folder
          the Account already has.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <FolderRoleFields value={value} onChange={setDraft} folders={folders ?? []} />
        <div className='flex items-center gap-3'>
          <Button disabled={!dirty || accepted === null || repoint.isPending} onClick={onSave}>
            {repoint.isPending ? 'Saving…' : 'Save folders'}
          </Button>
          {dirty ?
            <span className='text-sm [color:var(--warning)]'>● Unsaved changes</span>
          : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * What this Account can and cannot carry, as read from the backend at its last
 * poll (d-bzw8qoiy) — with the reason for each gap, which is what says "which
 * Accounts those are and why" (d-5h66e3zl, d-jl5giafw).
 */
export function AccountCapabilitiesCard({ account }: { account: AccountSummary }) {
  const missing = ACCOUNT_CAPABILITIES.filter((capability) => !accountSupports(account, capability))

  return (
    <Card>
      <CardHeader>
        <CardTitle>What grinbox can do here</CardTitle>
        <CardDescription>
          Read from this mailbox when grinbox last logged in. An Operator naming something this Account cannot carry is
          saved anyway and fails on this Account when it runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account.capabilities === null ?
          <p className='text-sm text-muted-foreground'>
            Grinbox has not polled this Account yet, so it has not read what this mailbox offers.
          </p>
        : <ul className='space-y-2 text-sm'>
            {ACCOUNT_CAPABILITIES.map((capability) => {
              const reason = unsupportedReason(account, capability)
              return (
                <li key={capability} className='flex flex-wrap items-baseline gap-x-2'>
                  <span className={reason === null ? '' : '[color:var(--warning)]'}>
                    {reason === null ? 'Can' : 'Cannot'} {CAPABILITY_LABELS[capability]}
                  </span>
                  {reason === null ? null : <span className='text-xs text-muted-foreground'>— {reason}</span>}
                </li>
              )
            })}
          </ul>
        }
        {missing.length > 0 && account.capabilities !== null ?
          <p className='mt-3 text-xs text-muted-foreground'>{errorFreeNote(missing.includes('send_message'))}</p>
        : null}
      </CardContent>
    </Card>
  )
}

/** The one gap worth spelling out: a digest has nowhere to go (d-5h66e3zl). */
function errorFreeNote(cannotSend: boolean): string {
  return cannotSend ?
      'A digest edition claims no occurrence for this Account, because grinbox cannot send mail through it.'
    : 'Operators naming the rest run here normally.'
}
