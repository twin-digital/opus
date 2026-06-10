import type { DashboardResponse, RecentOperatorEdit, TopTag } from '@twin-digital/grinbox-server'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { Page, PageHeader } from '../components/page.js'
import { TagChip } from '../components/tag-chip.js'
import { relativeTime } from '../lib/format.js'
import { useDashboard } from '../lib/hooks.js'

/**
 * Dashboard (ui-design.md "Dashboard"): the landing page, scannable in five
 * seconds. A first-run checklist on top — auto-hidden once all three setup
 * steps are complete — over an always-visible card grid. Numbers are the
 * primary content; charts stay secondary. Every aggregate is read from the
 * single `GET /api/dashboard` round-trip via {@link useDashboard}; the page
 * renders only the fields the API actually returns (no fabricated series).
 */
export function DashboardPage() {
  const { data, isPending, isError, refetch } = useDashboard()

  return (
    <Page className='space-y-8'>
      <PageHeader title='Dashboard' description='Scannable five-second overview.' />

      {isError ?
        <ErrorState
          onRetry={() => {
            void refetch()
          }}
        />
      : isPending ?
        <DashboardSkeleton />
      : <DashboardContent data={data} />}
    </Page>
  )
}

function DashboardContent({ data }: { data: DashboardResponse }) {
  const setupComplete =
    data.first_run.has_account && data.first_run.has_pipeline && data.first_run.has_assigned_pipeline
  const hasAlerts = data.errors_last_24h > 0 || data.limit_hits_last_24h > 0 || data.failed_triages_last_24h > 0

  return (
    <>
      {setupComplete ? null : <FirstRunChecklist firstRun={data.first_run} />}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <StatCard label='Triages last 24h' value={data.triages_last_24h} />
        <StatCard label='Notifications sent today' value={data.notifications_sent_today} />
        {hasAlerts ?
          <AlertsCard
            errors={data.errors_last_24h}
            limitHits={data.limit_hits_last_24h}
            failedTriages={data.failed_triages_last_24h}
          />
        : null}

        <TopTagsCard tags={data.top_tags} className={hasAlerts ? 'md:col-span-3' : 'md:col-span-1'} />
      </div>

      <RecentOperatorEditsCard edits={data.recent_operator_edits} />
    </>
  )
}

// --- First-run checklist ---------------------------------------------------

interface FirstRunFlags {
  readonly has_account: boolean
  readonly has_pipeline: boolean
  readonly has_assigned_pipeline: boolean
}

/**
 * The three onboarding steps, each linking to the surface that completes it.
 * Doubles as a recovery affordance: if a user later deletes an Account or
 * unassigns a Pipeline, the relevant step reappears.
 */
function FirstRunChecklist({ firstRun }: { firstRun: FirstRunFlags }) {
  const items: { label: string; done: boolean; to: string }[] = [
    { label: 'Add an Account', done: firstRun.has_account, to: '/accounts' },
    {
      label: 'Create a Pipeline',
      done: firstRun.has_pipeline,
      to: '/pipelines',
    },
    {
      label: 'Assign the Pipeline to the Account',
      done: firstRun.has_assigned_pipeline,
      to: '/accounts',
    },
  ]

  return (
    <section className='overflow-hidden rounded-lg border border-border bg-card'>
      <div className='border-b border-border px-4 py-3'>
        <p className='text-xs uppercase tracking-wider text-muted-foreground'>Get started</p>
        <p className='mt-0.5 text-base font-semibold'>Finish setup</p>
        <p className='mt-1 text-xs text-muted-foreground'>This card disappears once all three steps are done.</p>
      </div>
      <ul className='divide-y divide-border text-sm'>
        {items.map((item) => (
          <li key={item.label} className='flex items-center gap-3 px-4 py-3'>
            {item.done ?
              <span className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/15 [color:var(--success)]'>
                <Check className='h-3 w-3' aria-hidden />
              </span>
            : <span className='inline-flex h-5 w-5 rounded-full border border-border' />}
            <span className={item.done ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{item.label}</span>
            <Link to={item.to} className='text-xs text-primary hover:underline'>
              {item.done ? 'Done' : 'Go'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- Cards -----------------------------------------------------------------

/**
 * A metric tile: a muted label over one big number. The API exposes these
 * aggregates as scalar counts (no time series), so there is no sparkline to
 * draw — the number stands alone rather than fabricating a chart.
 */
function StatCard({ label, value, children }: { label: string; value: number; children?: ReactNode }) {
  return (
    <div className='rounded-lg border border-border bg-card p-4'>
      <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>{label}</p>
      <p className='mt-2 text-3xl font-semibold'>{value}</p>
      {children}
    </div>
  )
}

/**
 * Error / Limit-hit alert tile. Rendered only by the caller when at least one
 * of the counts is non-zero (ui-design.md: "only rendered if non-zero").
 * Links into the Activity Log, where the underlying events live.
 */
function AlertsCard({
  errors,
  limitHits,
  failedTriages,
}: {
  errors: number
  limitHits: number
  failedTriages: number
}) {
  const parts: string[] = []
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`)
  }
  if (limitHits > 0) {
    parts.push(`${limitHits} limit hit${limitHits === 1 ? '' : 's'}`)
  }
  if (failedTriages > 0) {
    parts.push(`${failedTriages} failed triage${failedTriages === 1 ? '' : 's'}`)
  }
  const total = errors + limitHits + failedTriages

  return (
    <div className='rounded-lg border border-danger/40 bg-danger/10 p-4'>
      <p className='inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider [color:var(--danger)]'>
        <AlertTriangle className='h-3 w-3' aria-hidden />
        Alerts
      </p>
      <p className='mt-2 text-3xl font-semibold [color:var(--danger)]'>{total}</p>
      <Link to='/activity' className='mt-2 block text-xs [color:var(--danger)] hover:underline'>
        {parts.join(' · ')}
      </Link>
    </div>
  )
}

/**
 * Top Tag distribution over recent Messages. Each row is a Tag chip plus its
 * occurrence count — compact, scannable, numbers to the right.
 */
function TopTagsCard({ tags, className }: { tags: readonly TopTag[]; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className ?? ''}`}>
      <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>Top Tags · recent Messages</p>
      {tags.length === 0 ?
        <p className='mt-3 text-sm text-muted-foreground'>
          No Tags yet — they show up here once Messages have been triaged.
        </p>
      : <div className='mt-3 flex flex-wrap gap-2'>
          {tags.map((tag) => (
            <span key={`${tag.key}:${tag.value}`} className='inline-flex items-center gap-1.5'>
              <TagChip tagKey={tag.key} value={tag.value} />
              <span className='text-xs tabular-nums text-muted-foreground'>{tag.count}</span>
            </span>
          ))}
        </div>
      }
    </div>
  )
}

/**
 * Quick links to the most recent Operator edits. The change-log row carries the
 * Operator id and action but no Pipeline id, so each entry links to the
 * Pipelines surface (where the owning Pipeline — and the Operator — is reached),
 * matching the mockup's "All →" target.
 */
function RecentOperatorEditsCard({ edits }: { edits: readonly RecentOperatorEdit[] }) {
  return (
    <section className='overflow-hidden rounded-lg border border-border bg-card'>
      <div className='flex items-center justify-between border-b border-border px-4 py-3'>
        <p className='text-xs uppercase tracking-wider text-muted-foreground'>Recent Operator edits</p>
        <Link to='/pipelines' className='text-xs text-primary hover:underline'>
          All <ArrowRight className='inline h-3 w-3' aria-hidden />
        </Link>
      </div>
      {edits.length === 0 ?
        <p className='px-4 py-6 text-sm text-muted-foreground'>No Operator edits yet.</p>
      : <ul className='divide-y divide-border text-sm'>
          {edits.map((edit) => (
            <li key={edit.change_log_id} className='flex items-center justify-between px-4 py-2.5'>
              <Link to='/pipelines' className='mr-3 flex-1 truncate hover:underline'>
                <span className='capitalize'>{edit.action}</span>{' '}
                <span className='text-muted-foreground'>Operator #{edit.operator_id}</span>
              </Link>
              <span className='font-mono text-xs text-muted-foreground'>{relativeTime(edit.recorded_at)}</span>
            </li>
          ))}
        </ul>
      }
    </section>
  )
}

// --- Loading / error states ------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className='space-y-8'>
      <div className='h-32 animate-pulse rounded-lg border border-border bg-card' />
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {[0, 1, 2].map((i) => (
          <div key={i} className='h-28 animate-pulse rounded-lg border border-border bg-card' />
        ))}
      </div>
      <div className='h-40 animate-pulse rounded-lg border border-border bg-card' />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-base font-medium'>Couldn't load the Dashboard</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        Couldn't reach the Grinbox daemon. The dashboard fills in once the API is up.
      </p>
      <button
        type='button'
        onClick={onRetry}
        className='mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted'
      >
        Retry
      </button>
    </div>
  )
}
