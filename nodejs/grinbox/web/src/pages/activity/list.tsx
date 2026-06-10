import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { X } from 'lucide-react'

import { Page } from '../../components/page.js'
import { SeverityIndicator } from '../../components/severity-indicator.js'
import { Button } from '../../components/ui/button.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js'
import { type ActivityEntry, type ActivitySeverity, useActivity } from '../../lib/activity.js'
import { relativeTime } from '../../lib/format.js'
import { type ActivitySearch, filtersFromSearch, hasActiveFilters } from './search.js'

/**
 * Activity Log (ui-design.md "Activity Log"): a chronological, most-recent-first
 * feed of operational events about Grinbox itself — Resource-op Limit hits,
 * Resource-op failures, and failed Operator runs — filterable by severity and
 * Resource, with both filters round-tripped through the URL so a filtered view
 * is linkable (the Dashboard alert card deep-links here pre-filtered).
 *
 * The feed is **Triage-derived**: daemon-level events (startup / shutdown / Gmail
 * fetch errors) are written to the systemd journal, not the State DB, so this
 * DB-backed surface covers Triage-time operational events only. The page says so
 * in its subhead. Each entry is shown with a severity indicator, the Resource +
 * operation, a human-readable description (Limit hits read like "Pushover
 * send_notification limited"; failures show the error), a relative time, and —
 * where the event carries one — a link into the originating Message.
 */
export function ActivityPage() {
  const search = useSearch({ from: '/activity' })
  const navigate = useNavigate()
  const filters = filtersFromSearch(search)

  const { data, isPending, isError, error, isPlaceholderData } = useActivity(filters)

  function patchSearch(next: Partial<ActivitySearch>) {
    void navigate({
      to: '/activity',
      search: (prev: ActivitySearch) => {
        // Resetting to page 1 on any filter change keeps the offset valid.
        const merged: ActivitySearch = { ...prev, ...next, page: 1 }
        return pruneSearch(merged, next)
      },
    })
  }

  function setPage(page: number) {
    void navigate({
      to: '/activity',
      search: (prev: ActivitySearch) => ({ ...prev, page }),
    })
  }

  const events = data?.events ?? []
  const filtersActive = hasActiveFilters(search)
  // The API returns a page window (limit/offset) but no total. A full page
  // implies there may be more; treat that as the "next" affordance.
  const page = Math.floor(filters.offset / filters.limit) + 1
  const hasNext = events.length === filters.limit

  return (
    <Page>
      <header className='mb-6'>
        <h1 className='text-3xl font-semibold tracking-tight'>Activity Log</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          Triage-time operational events — Limit hits, Resource-op failures, and failed Operator runs — most recent
          first. Daemon-level events (startup, shutdown, Gmail fetch errors) go to the system journal.
        </p>
      </header>

      <ActivityControls search={search} onChange={patchSearch} />

      {isError ?
        <ErrorState message={error.message} />
      : isPending ?
        <ActivitySkeleton />
      : events.length === 0 ?
        <EmptyActivity filtersActive={filtersActive} />
      : <>
          <ActivityFeed events={events} dimmed={isPlaceholderData} />
          <Pagination page={page} hasNext={hasNext} onPage={setPage} />
        </>
      }
    </Page>
  )
}

/** Remove keys whose value is undefined, but only for keys the caller touched. */
function pruneSearch(merged: ActivitySearch, touched: Partial<ActivitySearch>): ActivitySearch {
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

function ActivityControls({
  search,
  onChange,
}: {
  search: ActivitySearch
  onChange: (next: Partial<ActivitySearch>) => void
}) {
  return (
    <div className='mb-4 flex flex-wrap items-center gap-2'>
      <SeverityFilter
        value={search.severity}
        onChange={(severity) => {
          onChange({ severity })
        }}
      />
      <ResourceFilter
        value={search.resource}
        onChange={(resource) => {
          onChange({ resource })
        }}
      />
      {hasActiveFilters(search) ?
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            onChange({ severity: undefined, resource: undefined })
          }}
        >
          <X className='mr-1 h-3.5 w-3.5' />
          Clear filters
        </Button>
      : null}
    </div>
  )
}

const ALL = '__all__'

const SEVERITY_LABELS: Record<ActivitySeverity, string> = {
  error: 'Errors',
  warning: 'Limit hits',
}

function SeverityFilter({
  value,
  onChange,
}: {
  value: ActivitySeverity | undefined
  onChange: (severity: ActivitySeverity | undefined) => void
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => {
        onChange(v === ALL ? undefined : (v as ActivitySeverity))
      }}
    >
      <SelectTrigger className='h-8 w-auto min-w-36 gap-2' aria-label='Severity'>
        <SelectValue placeholder='Severity' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All severities</SelectItem>
        {(Object.keys(SEVERITY_LABELS) as ActivitySeverity[]).map((s) => (
          <SelectItem key={s} value={s}>
            {SEVERITY_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Free-text Resource filter (matches the `resource` query param). The API
 * filters on an exact Resource name, so this is a typed entry rather than a
 * fixed enum — the set of Resources isn't enumerated by the activity API.
 */
function ResourceFilter({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (resource: string | undefined) => void
}) {
  function commit(raw: string) {
    const trimmed = raw.trim()
    onChange(trimmed === '' ? undefined : trimmed)
  }

  return (
    <input
      aria-label='Resource'
      placeholder='Resource'
      defaultValue={value ?? ''}
      key={value ?? ''}
      onBlur={(e) => {
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit((e.target as HTMLInputElement).value)
        }
      }}
      className='h-8 w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
    />
  )
}

// --- Feed -----------------------------------------------------------------

function ActivityFeed({ events, dimmed }: { events: readonly ActivityEntry[]; dimmed: boolean }) {
  return (
    <div className={dimmed ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className='divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm'>
        {events.map((e) => (
          <ActivityRow key={rowKey(e)} entry={e} />
        ))}
      </div>
    </div>
  )
}

/** A stable per-row key across both source shapes. */
function rowKey(e: ActivityEntry): string {
  return `${e.source}:${e.triage_id}:${e.operator_id}:${e.event_type}:${e.recorded_at}`
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className='grid grid-cols-[140px_1fr_auto] items-center gap-3 px-4 py-3' data-severity={entry.severity}>
      <SeverityIndicator severity={entry.severity} />
      <div className='min-w-0'>
        <p className='truncate'>{describe(entry)}</p>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <span>{relativeTime(entry.recorded_at)}</span>
          {entry.message_id !== null ?
            <Link
              to='/inbox/$messageId'
              params={{ messageId: String(entry.message_id) }}
              className='font-medium [color:var(--primary)] hover:underline'
            >
              View Message
            </Link>
          : null}
        </div>
      </div>
      <div className='whitespace-nowrap text-right font-mono text-xs text-muted-foreground'>
        {entry.resource ?? '—'}
        {entry.operation ? `.${entry.operation}` : ''}
      </div>
    </div>
  )
}

/**
 * Render a human-readable description per entry. Limit hits read like "Pushover
 * send_notification limited"; failures show the error detail.
 */
function describe(e: ActivityEntry): string {
  if (e.event_type === 'resource_op_limited') {
    const subject =
      e.resource && e.operation ? `${e.resource} ${e.operation}` : (e.resource ?? e.operation ?? 'Resource op')
    const base = `${capitalize(subject)} limited`
    return e.detail ? `${base} — ${e.detail}` : base
  }
  if (e.event_type === 'resource_op_failed') {
    const subject =
      e.resource && e.operation ? `${e.resource} ${e.operation}` : (e.resource ?? e.operation ?? 'Resource op')
    const base = `${capitalize(subject)} failed`
    return e.detail ? `${base} — ${e.detail}` : base
  }
  if (e.event_type === 'operator_run_failed') {
    return e.detail ? `Operator run failed — ${e.detail}` : 'Operator run failed'
  }
  // Unknown event type: best-effort fallback.
  const label = e.event_type.replace(/_/g, ' ')
  return e.detail ? `${capitalize(label)} — ${e.detail}` : capitalize(label)
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

// --- Pagination -----------------------------------------------------------

function Pagination({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) {
  return (
    <div className='mt-4 flex items-center justify-end gap-2'>
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
      <span className='text-sm text-muted-foreground'>Page {page}</span>
      <Button
        variant='outline'
        size='sm'
        disabled={!hasNext}
        onClick={() => {
          onPage(page + 1)
        }}
      >
        Next
      </Button>
    </div>
  )
}

// --- States ---------------------------------------------------------------

function EmptyActivity({ filtersActive }: { filtersActive: boolean }) {
  return (
    <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center'>
      <p className='text-xl font-medium'>:)</p>
      <p className='mt-2 text-base font-medium'>No operational events</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        {filtersActive ?
          'No event matches the current filters. Try clearing or loosening them.'
        : 'Nothing to report. Limit hits and Triage-time failures show up here as Grinbox runs.'}
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-base font-medium'>Couldn't load activity</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>{message}</p>
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <div className='divide-y divide-border rounded-lg border border-border'>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className='flex items-center gap-4 px-4 py-3'>
          <div className='h-4 w-24 animate-pulse rounded bg-muted' />
          <div className='h-4 flex-1 animate-pulse rounded bg-muted' />
          <div className='h-4 w-28 animate-pulse rounded bg-muted' />
        </div>
      ))}
    </div>
  )
}
