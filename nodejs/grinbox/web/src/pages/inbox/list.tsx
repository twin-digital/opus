import type { AccountSummary, MessageRow, PipelineSummary } from '@twin-digital/grinbox-server'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AccountIcon } from '../../components/account-icon.js'
import { Page } from '../../components/page.js'
import { SourceStateBadge } from '../../components/source-state-badge.js'
import { TagChip, orderTagsByPriority } from '../../components/tag-chip.js'
import { TriageStatusIndicator } from '../../components/triage-status-indicator.js'
import { Button } from '../../components/ui/button.js'
import { Input } from '../../components/ui/input.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js'
import { useAccounts } from '../../lib/accounts.js'
import { relativeTime } from '../../lib/format.js'
import {
  type SourceStateFilter,
  type TriageStatusFilter,
  errorMessage,
  useMessages,
  useSyncNow,
} from '../../lib/messages.js'
import { usePipelineList } from '../../lib/pipelines.js'
import { cn } from '../../lib/utils.js'
import { type InboxSearch, filtersFromSearch, hasActiveFilters } from './search.js'

/**
 * Inbox (ui-design.md "Inbox / Message browser"): a comfortable-density,
 * paginated table of Messages across all Accounts. A search input filters over
 * from/subject/snippet (`q`); filter chips narrow by Account, Pipeline, Triage
 * status, and Tag presence; all of it round-trips through the URL search params
 * so a filtered view is linkable. Each row leads with the source-account icon in
 * a hanging indent, then a primary line (from / subject / status / time); the
 * current Tags wrap onto their own full-width row beneath. Clicking a row opens
 * Message detail. First load shows a skeleton; an empty result renders the
 * first-run or no-match empty state.
 */
export function InboxPage() {
  const search = useSearch({ from: '/inbox' })
  const navigate = useNavigate()
  const filters = filtersFromSearch(search)

  const { data, isPending, isError, error, isPlaceholderData, isFetching } = useMessages(filters)
  const sync = useSyncNow()
  const refreshing = sync.isPending || isFetching

  function patchSearch(next: Partial<InboxSearch>) {
    void navigate({
      to: '/inbox',
      search: (prev: InboxSearch) => {
        // Resetting to page 1 on any filter change keeps the offset valid.
        const merged: InboxSearch = { ...prev, ...next, page: 1 }
        // Drop undefined keys so they leave the URL.
        return pruneSearch(merged, next)
      },
    })
  }

  function setPage(page: number) {
    void navigate({
      to: '/inbox',
      search: (prev: InboxSearch) => ({ ...prev, page }),
    })
  }

  const total = data?.page.total ?? 0
  const filtersActive = hasActiveFilters(search)

  return (
    <Page>
      <header className='mb-6'>
        <h1 className='text-3xl font-semibold tracking-tight'>Inbox</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          Every Message Grinbox has seen, with its current Tags and latest Triage.
        </p>
      </header>

      <InboxControls search={search} onChange={patchSearch} />

      <div className='mb-2 flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            sync.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(
                  r.newMessages > 0 ?
                    `Synced — ${r.newMessages} new message${r.newMessages === 1 ? '' : 's'}`
                  : 'Synced — no new mail',
                ),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }}
          disabled={refreshing}
          aria-label='Sync with Gmail'
          title='Sync with Gmail'
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isError ?
        <ErrorState message={error.message} />
      : isPending ?
        <InboxSkeleton />
      : data.messages.length === 0 ?
        <EmptyInbox filtersActive={filtersActive} />
      : <>
          <MessagesTable messages={data.messages} dimmed={isPlaceholderData} />
          <Pagination offset={filters.offset} limit={filters.limit} total={total} onPage={setPage} />
        </>
      }
    </Page>
  )
}

/** Remove keys whose value is undefined, but only for keys the caller touched. */
function pruneSearch(merged: InboxSearch, touched: Partial<InboxSearch>): InboxSearch {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined && key in touched) {
      continue
    }
    out[key] = value
  }
  return out
}

// --- Controls -------------------------------------------------------------

function InboxControls({ search, onChange }: { search: InboxSearch; onChange: (next: Partial<InboxSearch>) => void }) {
  const { data: accounts } = useAccounts()
  const { data: pipelines } = usePipelineList()

  return (
    <div className='mb-4 space-y-3'>
      <SearchInput
        value={search.q ?? ''}
        onCommit={(q) => {
          onChange({ q })
        }}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <AccountFilter
          accounts={accounts}
          value={search.accountId}
          onChange={(accountId) => {
            onChange({ accountId })
          }}
        />
        <PipelineFilter
          pipelines={pipelines}
          value={search.pipelineId}
          onChange={(pipelineId) => {
            onChange({ pipelineId })
          }}
        />
        <StatusFilter
          value={search.status}
          onChange={(status) => {
            onChange({ status })
          }}
        />
        <ScopeFilter
          value={search.sourceState}
          onChange={(sourceState) => {
            onChange({ sourceState })
          }}
        />
        <TagFilter
          value={search.tagKey}
          onCommit={(tagKey) => {
            onChange({ tagKey })
          }}
        />
        {hasActiveFilters(search) ?
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              onChange({
                accountId: undefined,
                pipelineId: undefined,
                status: undefined,
                tagKey: undefined,
                dateFrom: undefined,
                dateTo: undefined,
                q: undefined,
              })
            }}
          >
            <X className='mr-1 h-3.5 w-3.5' />
            Clear filters
          </Button>
        : null}
      </div>
    </div>
  )
}

/** Debounced free-text search; commits on a short pause and on Enter. */
function SearchInput({ value, onCommit }: { value: string; onCommit: (q: string | undefined) => void }) {
  const [draft, setDraft] = useState(value)

  // Keep the local draft in sync when the URL changes from elsewhere.
  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) {
      return
    }
    const handle = setTimeout(() => {
      onCommit(draft.trim() === '' ? undefined : draft.trim())
    }, 300)
    return () => {
      clearTimeout(handle)
    }
  }, [draft, value, onCommit])

  return (
    <div className='relative max-w-md'>
      <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        aria-label='Search messages'
        placeholder='Search from, subject, or snippet'
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit(draft.trim() === '' ? undefined : draft.trim())
          }
        }}
        className='pl-9'
      />
    </div>
  )
}

const ALL = '__all__'

function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly AccountSummary[] | undefined
  value: number | undefined
  onChange: (id: number | undefined) => void
}) {
  return (
    <Select
      value={value === undefined ? ALL : String(value)}
      onValueChange={(v) => {
        onChange(v === ALL ? undefined : Number(v))
      }}
    >
      <SelectTrigger className='h-8 w-auto min-w-36 gap-2' aria-label='Account'>
        <SelectValue placeholder='Account' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All accounts</SelectItem>
        {accounts?.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PipelineFilter({
  pipelines,
  value,
  onChange,
}: {
  pipelines: readonly PipelineSummary[] | undefined
  value: number | undefined
  onChange: (id: number | undefined) => void
}) {
  return (
    <Select
      value={value === undefined ? ALL : String(value)}
      onValueChange={(v) => {
        onChange(v === ALL ? undefined : Number(v))
      }}
    >
      <SelectTrigger className='h-8 w-auto min-w-36 gap-2' aria-label='Pipeline'>
        <SelectValue placeholder='Pipeline' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All pipelines</SelectItem>
        {pipelines?.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const STATUS_LABELS: Record<TriageStatusFilter, string> = {
  running: 'Running',
  completed: 'Completed',
  partial: 'Partial',
  failed: 'Failed',
}

function StatusFilter({
  value,
  onChange,
}: {
  value: TriageStatusFilter | undefined
  onChange: (status: TriageStatusFilter | undefined) => void
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => {
        onChange(v === ALL ? undefined : (v as TriageStatusFilter))
      }}
    >
      <SelectTrigger className='h-8 w-auto min-w-32 gap-2' aria-label='Triage status'>
        <SelectValue placeholder='Status' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any status</SelectItem>
        {(Object.keys(STATUS_LABELS) as TriageStatusFilter[]).map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const SCOPE_LABELS: Record<SourceStateFilter, string> = {
  present: 'In inbox',
  all: 'All messages',
  archived: 'Archived',
  trashed: 'Trashed',
  spam: 'Spam',
  deleted: 'Deleted',
}

/**
 * Backend-disposition scope. Defaults to `present` (the live inbox); the absent
 * value maps to `present` so the default never appears in the URL.
 */
function ScopeFilter({
  value,
  onChange,
}: {
  value: SourceStateFilter | undefined
  onChange: (sourceState: SourceStateFilter | undefined) => void
}) {
  return (
    <Select
      value={value ?? 'present'}
      onValueChange={(v) => {
        onChange(v === 'present' ? undefined : (v as SourceStateFilter))
      }}
    >
      <SelectTrigger className='h-8 w-auto min-w-32 gap-2' aria-label='Scope'>
        <SelectValue placeholder='Scope' />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SCOPE_LABELS) as SourceStateFilter[]).map((s) => (
          <SelectItem key={s} value={s}>
            {SCOPE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Free-text Tag-presence filter (matches the `tagKey` query param). */
function TagFilter({ value, onCommit }: { value: string | undefined; onCommit: (tagKey: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  function commit() {
    const trimmed = draft.trim()
    onCommit(trimmed === '' ? undefined : trimmed)
  }

  return (
    <div className='flex items-center gap-1'>
      <Input
        aria-label='Has tag'
        placeholder='Has tag (key)'
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
          }
        }}
        className='h-8 w-36'
      />
    </div>
  )
}

// --- Table ----------------------------------------------------------------

/** Grid template shared by the header and each row's primary line. */
const ROW_GRID = 'grid grid-cols-[180px_1fr_120px_64px] items-center gap-3'

function MessagesTable({ messages, dimmed }: { messages: readonly MessageRow[]; dimmed: boolean }) {
  // Account names (for the hanging-indent icon tooltip), keyed by id. Cached by
  // react-query; the filter controls load the same query.
  const { data: accounts } = useAccounts()
  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]))

  return (
    <div className={dimmed ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className='overflow-hidden rounded-lg border border-border'>
        {/* Header: an empty cell over the account-icon column, then the grid. */}
        <div className='flex items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground'>
          <div className='w-7 shrink-0' />
          <div className={`flex-1 ${ROW_GRID}`}>
            <div>From</div>
            <div>Subject</div>
            <div>Status</div>
            <div className='text-right'>Time</div>
          </div>
        </div>
        <div className='divide-y divide-border'>
          {messages.map((m) => (
            <MessageRowView key={m.id} message={m} account={accountsById.get(m.account_id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MessageRowView({ message, account }: { message: MessageRow; account?: AccountSummary }) {
  const tags = orderTagsByPriority(message.current_tags.map((t) => ({ ...t, key: t.key, value: t.value })))
  // Messages no longer in the inbox are dimmed and badged so they read as
  // history, not live items.
  const stale = message.source_state !== 'present'

  return (
    <Link
      to='/inbox/$messageId'
      params={{ messageId: String(message.id) }}
      className={cn('flex items-start gap-3 px-3 py-2.5 hover:bg-accent/50', stale && 'opacity-60')}
    >
      {/* Account icon in a hanging indent: top-aligned, spans metadata + tags. */}
      <AccountIcon
        accountId={message.account_id}
        name={account?.name}
        icon={account?.icon}
        color={account?.color}
        className='mt-0.5'
      />
      <div className='min-w-0 flex-1'>
        <div className={ROW_GRID}>
          <span className='truncate text-sm font-medium' title={message.from_header ?? undefined}>
            {displayFrom(message.from_header)}
          </span>
          <div className='min-w-0'>
            <span className='flex items-center gap-2'>
              <span className='truncate text-sm font-medium'>{message.subject ?? '(no subject)'}</span>
              <SourceStateBadge state={message.source_state} />
            </span>
            {message.snippet ?
              <span className='block truncate text-xs text-muted-foreground'>{message.snippet}</span>
            : null}
          </div>
          <span>
            {message.latest_triage_status ?
              <TriageStatusIndicator status={message.latest_triage_status} />
            : <span className='text-xs text-muted-foreground'>not triaged</span>}
          </span>
          <span className='text-right text-sm text-muted-foreground'>{relativeTime(message.received_at)}</span>
        </div>
        {tags.length > 0 ?
          <div className='mt-3 flex flex-wrap gap-1'>
            {tags.map((t) => (
              <TagChip key={`${t.key}:${t.value}`} tagKey={t.key} value={t.value} />
            ))}
          </div>
        : null}
      </div>
    </Link>
  )
}

/** Trim a `From:` header down to the display name or bare address. */
export function displayFrom(from: string | null): string {
  if (!from) {
    return '(unknown sender)'
  }
  const match = /^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/.exec(from)
  if (match) {
    return match[1].trim() || match[2].trim()
  }
  return from.trim()
}

// --- Pagination -----------------------------------------------------------

export function Pagination({
  offset,
  limit,
  total,
  onPage,
}: {
  offset: number
  limit: number
  total: number
  onPage: (page: number) => void
}) {
  const page = Math.floor(offset / limit) + 1
  const lastPage = Math.max(1, Math.ceil(total / limit))
  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + limit, total)

  return (
    <div className='mt-4 flex items-center justify-between'>
      <p className='text-sm text-muted-foreground'>
        {first}–{last} of {total}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1)
          }}
        >
          Previous
        </Button>
        <span className='text-sm text-muted-foreground'>
          Page {page} of {lastPage}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= lastPage}
          onClick={() => {
            onPage(page + 1)
          }}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// --- States ---------------------------------------------------------------

function EmptyInbox({ filtersActive }: { filtersActive: boolean }) {
  return (
    <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center'>
      <p className='text-xl font-medium'>:)</p>
      <p className='mt-2 text-base font-medium'>{filtersActive ? 'No matching messages' : 'No messages yet'}</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        {filtersActive ?
          'No Message matches the current filters. Try clearing or loosening them.'
        : 'Once Grinbox polls a connected Account and triages its mail, those Messages show up here.'}
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-base font-medium'>Couldn't load messages</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>{message}</p>
    </div>
  )
}

function InboxSkeleton() {
  return (
    <div className='rounded-lg border border-border'>
      <div className='divide-y divide-border'>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className='flex h-12 items-center gap-4 px-4'>
            <div className='h-4 w-36 animate-pulse rounded bg-muted' />
            <div className='h-4 flex-1 animate-pulse rounded bg-muted' />
            <div className='h-4 w-20 animate-pulse rounded bg-muted' />
            <div className='ml-auto h-4 w-12 animate-pulse rounded bg-muted' />
          </div>
        ))}
      </div>
    </div>
  )
}
