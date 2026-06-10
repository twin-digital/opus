import type { AccountSummary } from '@twin-digital/grinbox-server'
import { Link } from '@tanstack/react-router'

import { Page } from '../../components/page.js'
import { StatusIndicator } from '../../components/status-indicator.js'
import { Badge } from '../../components/ui/badge.js'
import { Button } from '../../components/ui/button.js'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.js'
import { useAccounts } from '../../lib/accounts.js'
import { relativeTime } from '../../lib/format.js'
import { AddAccountButton } from './add-account-button.js'

/**
 * Account list (ui-design.md "Accounts + OAuth onboarding"): one row per live
 * Account showing provider, a status indicator (dot + label), last poll
 * (relative), and the active Pipeline — or the "no Pipeline assigned" warning
 * chip. Rows link to Account detail. First load shows a skeleton (Query
 * `isPending`); refetches are silent. An empty Account list renders a
 * quietly-helpful first-run empty state with the Add Account CTA.
 */
export function AccountsListPage() {
  const { data, isPending, isError, error } = useAccounts()

  return (
    <Page>
      <header className='mb-8 flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>Accounts</h1>
          <p className='mt-2 text-sm text-muted-foreground'>Connected mailboxes and their OAuth health.</p>
        </div>
        {data && data.length > 0 ?
          <AddAccountButton />
        : null}
      </header>

      {isError ?
        <ErrorState message={error.message} />
      : isPending ?
        <AccountsSkeleton />
      : data.length === 0 ?
        <EmptyAccounts />
      : <AccountsTable accounts={data} />}
    </Page>
  )
}

function AccountsTable({ accounts }: { accounts: readonly AccountSummary[] }) {
  return (
    <div className='rounded-lg border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pipeline</TableHead>
            <TableHead>Last poll</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AccountRow({ account }: { account: AccountSummary }) {
  return (
    <TableRow>
      <TableCell className='p-0'>
        <Link
          to='/accounts/$accountId'
          params={{ accountId: String(account.id) }}
          className='block px-4 py-3 font-medium hover:underline'
        >
          {account.name}
        </Link>
      </TableCell>
      <TableCell className='capitalize text-muted-foreground'>{providerLabel(account.provider_type)}</TableCell>
      <TableCell>
        <StatusIndicator status={account.status} />
      </TableCell>
      <TableCell>
        {account.active_pipeline_id === null ?
          <Badge variant='warning' title="This Account won't be triaged">
            no Pipeline assigned
          </Badge>
        : <span className='text-sm'>{account.active_pipeline_name}</span>}
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>{relativeTime(account.last_polled_at)}</TableCell>
    </TableRow>
  )
}

function providerLabel(providerType: string): string {
  if (providerType === 'gmail') {
    return 'Gmail'
  }
  return providerType
}

function EmptyAccounts() {
  return (
    <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center'>
      <p className='text-xl font-medium'>:)</p>
      <p className='mt-2 text-base font-medium'>No mailboxes yet</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        Connect a Gmail account to let Grinbox start reading and triaging your mail. You can assign a Pipeline once it's
        connected.
      </p>
      <div className='mt-6'>
        <AddAccountButton size='lg' />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  const { refetch } = useAccounts()
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-base font-medium'>Couldn't load Accounts</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>{message}</p>
      <div className='mt-4'>
        <Button
          variant='outline'
          onClick={() => {
            void refetch()
          }}
        >
          Retry
        </Button>
      </div>
    </div>
  )
}

function AccountsSkeleton() {
  return (
    <div className='rounded-lg border border-border'>
      <div className='divide-y divide-border'>
        {[0, 1, 2].map((i) => (
          <div key={i} className='flex items-center gap-4 px-4 py-4'>
            <div className='h-4 w-40 animate-pulse rounded bg-muted' />
            <div className='h-4 w-16 animate-pulse rounded bg-muted' />
            <div className='h-4 w-24 animate-pulse rounded bg-muted' />
            <div className='ml-auto h-4 w-16 animate-pulse rounded bg-muted' />
          </div>
        ))}
      </div>
    </div>
  )
}
