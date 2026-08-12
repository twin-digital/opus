import type { CurrentTag } from '@grinbox/server'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Page } from '@/components/page'
import { PendingArchiveNotice } from '@/components/pending-archive'
import { SourceStateBadge } from '@/components/source-state-badge'
import { TagChip } from '@/components/tag-chip'
import { TriageStatusIndicator } from '@/components/triage-status-indicator'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { errorMessage } from '@/lib/api-error'
import { absoluteTime, formatSeconds, relativeTime, timeUntil } from '@/lib/format'
import {
  type MessageDetail,
  type MessageTriage,
  type MessageTriageEvent,
  type MessageTriageRun,
  useMessage,
  useReplayMessage,
} from '@/lib/messages'
import { displayTagValue, useMoneyKeysByPipeline } from '@/lib/money'

/**
 * Message detail (ui-design.md "Message detail"): the "why did Grinbox do that"
 * page. A header (from / subject / date) over a tabbed body — Overview (current
 * Tags grouped by provenance + Replay), Tags (full Tag history across every
 * Triage, hoverable for provenance), and Triage history (a selectable list of
 * Triages, latest selected by default, each expanding its Operator runs +
 * chronological event log). Replay is plain (no confirm). There is no separate
 * `/triage` route — Triages are viewed in their Message's context.
 */
export function MessageDetailPage() {
  const { messageId } = useParams({ from: '/inbox/$messageId' })
  const id = Number(messageId)
  // `?triage=<id>` deep-selects a Triage — the landing side of a suppression's
  // cross-message deferral link (d-e9jslw4x).
  const { triage: initialTriageId } = useSearch({ from: '/inbox/$messageId' })
  const { data, isPending, isError, error } = useMessage(id)

  return (
    <Page>
      <Link
        to='/inbox'
        className='mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='h-4 w-4' />
        Back to Inbox
      </Link>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load this Message</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-4'>
          <div className='h-8 w-80 animate-pulse rounded bg-muted' />
          <div className='h-9 w-72 animate-pulse rounded bg-muted' />
          <div className='h-48 w-full animate-pulse rounded-lg bg-muted' />
        </div>
      : <MessageDetailView detail={data} messageId={id} initialTriageId={initialTriageId} />}
    </Page>
  )
}

function MessageDetailView({
  detail,
  messageId,
  initialTriageId,
}: {
  detail: MessageDetail
  messageId: number
  initialTriageId?: number
}) {
  const { message, current_tags, pending_archive, triages } = detail

  // Money-typed Tag keys per Pipeline this Message was triaged under, so every
  // surface that shows a Tag's value renders money in display form (d-u4gpx6ke).
  const moneyByPipeline = useMoneyKeysByPipeline([
    ...current_tags.map((t) => t.pipeline_id),
    ...triages.map((t) => t.pipeline_id),
  ])

  // The tab and the selected Triage are held here so a reference elsewhere on
  // the page — the pending Archive's recording Triage — can open the history at
  // that Triage.
  const [tab, setTab] = useState(initialTriageId === undefined ? 'overview' : 'triage')
  const [selectedTriageId, setSelectedTriageId] = useState<number | null>(initialTriageId ?? null)

  const showTriage = (id: number) => {
    setSelectedTriageId(id)
    setTab('triage')
  }

  return (
    <div>
      <header className='mb-6'>
        {/*
          No "open this message in the provider" link: naming a backend here would
          put it outside the account it belongs to (r-etj0gluz), and a Gmail web URL
          does not open the provider's app on a phone. A neutral link built from the
          provider seam is backlogged as b-rh4kku7d.
        */}
        <div className='flex items-start justify-between gap-4'>
          <h1 className='flex items-center gap-2 text-2xl font-semibold tracking-tight'>
            {message.subject ?? '(no subject)'}
            <SourceStateBadge state={message.source_state} />
          </h1>
        </div>
        <dl className='mt-2 space-y-1 text-sm text-muted-foreground'>
          <div className='flex gap-2'>
            <dt className='font-medium text-foreground'>From</dt>
            <dd>{message.from_header ?? '(unknown sender)'}</dd>
          </div>
          {message.to_header ?
            <div className='flex gap-2'>
              <dt className='font-medium text-foreground'>To</dt>
              <dd>{message.to_header}</dd>
            </div>
          : null}
          <div className='flex gap-2'>
            <dt className='font-medium text-foreground'>Received</dt>
            <dd>{relativeTime(message.received_at)}</dd>
          </div>
        </dl>
        {/* The pending Archive sits in the header rather than on a tab: it is
            about to change where the Message lives, so it reads beside the
            Message's standing wherever the reader is (d-p0ea1t8q). */}
        {pending_archive ?
          <PendingArchiveNotice pending={pending_archive} onSelectTriage={showTriage} />
        : null}
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='tags'>Tags</TabsTrigger>
          <TabsTrigger value='triage'>Triage history</TabsTrigger>
        </TabsList>

        <TabsContent value='overview'>
          <OverviewTab
            currentTags={current_tags}
            triages={triages}
            messageId={messageId}
            moneyByPipeline={moneyByPipeline}
          />
        </TabsContent>

        <TabsContent value='tags'>
          <TagsTab triages={triages} moneyByPipeline={moneyByPipeline} />
        </TabsContent>

        <TabsContent value='triage'>
          <TriageHistoryTab
            triages={triages}
            moneyByPipeline={moneyByPipeline}
            selectedId={selectedTriageId}
            onSelect={setSelectedTriageId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Overview -------------------------------------------------------------

function OverviewTab({
  currentTags,
  triages,
  messageId,
  moneyByPipeline,
}: {
  currentTags: readonly CurrentTag[]
  triages: readonly MessageTriage[]
  messageId: number
  moneyByPipeline: ReadonlyMap<number, ReadonlySet<string>>
}) {
  const triageById = new Map(triages.map((t) => [t.id, t]))

  return (
    <div className='space-y-8'>
      <section className='flex items-start justify-between gap-4'>
        <div>
          <h2 className='text-base font-semibold'>Replay</h2>
          <p className='mt-1 max-w-md text-sm text-muted-foreground'>
            Re-run the Message through its Account's active Pipeline. The prior Triage history is preserved.
          </p>
        </div>
        <ReplayButton messageId={messageId} />
      </section>

      <section>
        <h2 className='mb-3 text-base font-semibold'>Current Tags</h2>
        {currentTags.length === 0 ?
          <p className='text-sm text-muted-foreground'>No current Tags — this Message has no settled Triage output.</p>
        : <ul className='space-y-2'>
            {currentTags.map((tag) => (
              <li
                key={`${tag.triage_id}:${tag.operator_id}:${tag.key}:${tag.value}`}
                className='flex items-center gap-3'
              >
                <TagChip
                  tagKey={tag.key}
                  value={displayTagValue(tag.key, tag.value, moneyByPipeline.get(tag.pipeline_id))}
                  provenance={tagProvenance(tag, triageById.get(tag.triage_id))}
                />
                <span className='text-xs text-muted-foreground'>
                  {tagProvenance(tag, triageById.get(tag.triage_id))}
                </span>
              </li>
            ))}
          </ul>
        }
      </section>
    </div>
  )
}

function ReplayButton({ messageId }: { messageId: number }) {
  const replay = useReplayMessage(messageId)
  return (
    <Button
      onClick={() => {
        replay.mutate(undefined, {
          onSuccess: () => toast.success('Replay queued'),
          onError: (err) => toast.error(errorMessage(err)),
        })
      }}
      disabled={replay.isPending}
    >
      <RefreshCw className='mr-2 h-4 w-4' />
      Replay
    </Button>
  )
}

function tagProvenance(
  tag: { triage_id: number; operator_id: number; pipeline_id: number },
  triage: MessageTriage | undefined,
): string {
  const op = triage?.operator_runs.find((r) => r.operator_id === tag.operator_id) ?? null
  const opLabel = op ? `${op.type_key} @ ${op.type_code_version}` : `Operator ${tag.operator_id}`
  return `Triage ${tag.triage_id} · ${opLabel}`
}

// --- Tags -----------------------------------------------------------------

function TagsTab({
  triages,
  moneyByPipeline,
}: {
  triages: readonly MessageTriage[]
  moneyByPipeline: ReadonlyMap<number, ReadonlySet<string>>
}) {
  const rows = triages.flatMap((t) => t.tags.map((tag) => ({ triage: t, tag })))

  if (rows.length === 0) {
    return <p className='text-sm text-muted-foreground'>No Tags have been produced for this Message yet.</p>
  }

  return (
    <div>
      <p className='mb-3 text-sm text-muted-foreground'>
        Every Tag ever produced for this Message, across all Triages. Hover a chip for its provenance.
      </p>
      <ul className='space-y-2'>
        {rows.map(({ triage, tag }) => {
          const op = triage.operator_runs.find((r) => r.operator_id === tag.operator_id) ?? null
          const provenance = `Triage ${triage.id} · ${
            op ? `${op.type_key} @ ${op.type_code_version}` : `Operator ${tag.operator_id}`
          }`
          return (
            <li key={`${triage.id}:${tag.operator_id}:${tag.key}:${tag.value}`} className='flex items-center gap-3'>
              <TagChip
                tagKey={tag.key}
                value={displayTagValue(tag.key, tag.value, moneyByPipeline.get(triage.pipeline_id))}
                provenance={provenance}
              />
              <span className='text-xs text-muted-foreground'>
                {provenance}
                {' · '}
                {relativeTime(triage.started_at)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// --- Triage history -------------------------------------------------------

function TriageHistoryTab({
  triages,
  moneyByPipeline,
  selectedId,
  onSelect,
}: {
  triages: readonly MessageTriage[]
  moneyByPipeline: ReadonlyMap<number, ReadonlySet<string>>
  /** Null selects the latest Triage (the list is most-recent-first). */
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const setSelectedId = onSelect

  const first = triages.at(0)
  if (first === undefined) {
    return <p className='text-sm text-muted-foreground'>No Triages have run against this Message yet.</p>
  }

  const selected = triages.find((t) => t.id === selectedId) ?? first
  const triageIds = new Set(triages.map((t) => t.id))

  return (
    <div className='grid gap-6 md:grid-cols-[16rem_1fr]'>
      <ul className='space-y-1' aria-label='Triage history'>
        {triages.map((t) => {
          const active = t.id === selected.id
          return (
            <li key={t.id}>
              <button
                type='button'
                onClick={() => {
                  setSelectedId(t.id)
                }}
                aria-pressed={active}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                }`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>Triage {t.id}</span>
                  <TriageStatusIndicator status={t.status} />
                </div>
                <div className='mt-1 text-xs text-muted-foreground'>
                  {triggerLabel(t.triggered_by)} · {relativeTime(t.started_at)}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <TriageDetailPanel
        triage={selected}
        moneyKeys={moneyByPipeline.get(selected.pipeline_id)}
        knownTriageIds={triageIds}
        onSelectTriage={setSelectedId}
      />
    </div>
  )
}

function TriageDetailPanel({
  triage,
  moneyKeys,
  knownTriageIds,
  onSelectTriage,
}: {
  triage: MessageTriage
  moneyKeys: ReadonlySet<string> | undefined
  knownTriageIds: ReadonlySet<number>
  onSelectTriage: (id: number) => void
}) {
  return (
    <div className='space-y-6'>
      <section>
        <h3 className='mb-2 text-sm font-semibold'>Operator runs ({triage.operator_runs.length})</h3>
        {triage.operator_runs.length === 0 ?
          <p className='text-sm text-muted-foreground'>No Operator runs.</p>
        : <ul className='space-y-2'>
            {triage.operator_runs.map((run) => (
              <OperatorRunRow key={run.operator_id} run={run} events={triage.events} />
            ))}
          </ul>
        }
      </section>

      <section>
        <h3 className='mb-2 text-sm font-semibold'>Event log ({triage.events.length})</h3>
        {triage.events.length === 0 ?
          <p className='text-sm text-muted-foreground'>No events recorded.</p>
        : <ol className='space-y-1'>
            {triage.events.map((ev) => (
              <EventRow
                key={`${ev.operator_id}:${ev.sequence_num}`}
                event={ev}
                moneyKeys={moneyKeys}
                knownTriageIds={knownTriageIds}
                onSelectTriage={onSelectTriage}
              />
            ))}
          </ol>
        }
      </section>
    </div>
  )
}

function OperatorRunRow({ run, events }: { run: MessageTriageRun; events: readonly MessageTriageEvent[] }) {
  // A cooldown-suppressed push completes rather than fails (d-5amonj40): the
  // status dot above stays whatever the run reports (completed), and the
  // suppression shows on the run itself with its kind.
  const suppression = events
    .filter((ev) => ev.operator_id === run.operator_id && ev.event_type === 'resource_op_suppressed')
    .map((ev) => parseSuppression(ev.details_json))
    .find((s) => s !== null)

  // An Archive carrying a delay records the pending Archive instead of calling
  // the mailbox (d-grcdd4ov): the run completes, and what it scheduled shows on
  // the run the way a suppressed push does.
  const recordedArchive = events
    .filter((ev) => ev.operator_id === run.operator_id && ev.event_type === 'pending_archive_recorded')
    .map((ev) => parseRecordedArchive(ev.details_json))
    .find((r) => r !== null)

  return (
    <li className='rounded-md border border-border px-3 py-2'>
      <div className='flex items-center justify-between gap-2'>
        <span className='font-mono text-sm'>
          {run.type_key}
          <span className='ml-1 text-xs text-muted-foreground'>@ {run.type_code_version}</span>
        </span>
        <TriageStatusIndicator status={run.status} />
      </div>
      <div className='mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground'>
        <span>{formatDuration(run.duration_ms)}</span>
        {run.skip_reason ?
          <span>skipped: {run.skip_reason}</span>
        : null}
        {run.error_summary ?
          <span className='[color:var(--danger)]'>{run.error_summary}</span>
        : null}
        {suppression ?
          <span data-testid='run-suppression'>
            push suppressed — cooldown on <span className='font-mono'>{suppression.kind}</span>
          </span>
        : null}
        {recordedArchive ?
          <span data-testid='run-pending-archive'>archive scheduled — due {absoluteTime(recordedArchive.due_at)}</span>
        : null}
        {formatResourceUsage(run.resource_usage_json).map((u) => (
          <span key={u}>{u}</span>
        ))}
      </div>
      <RunConfigSnapshot snapshot={run.op_config_json} />
    </li>
  )
}

/**
 * The configuration this run executed against, captured when the triage was
 * enqueued (d-nr71oscu). Editing the operator afterwards does not change it, so
 * this is the configuration that produced the outcome above — not whatever the
 * pipeline says today (r-k6gh82fx).
 */
function RunConfigSnapshot({ snapshot }: { snapshot?: string | null }) {
  if (snapshot === undefined || snapshot === null || snapshot === '') {
    return null
  }

  return (
    <details className='mt-2'>
      <summary className='cursor-pointer text-xs text-muted-foreground hover:text-foreground'>
        Configuration this run used
      </summary>
      <pre
        data-testid='run-config-snapshot'
        className='mt-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs'
      >
        {formatSnapshot(snapshot)}
      </pre>
    </details>
  )
}

/** Pretty-print the stored snapshot; show it verbatim if it will not parse. */
function formatSnapshot(snapshot: string): string {
  try {
    return JSON.stringify(JSON.parse(snapshot), null, 2)
  } catch {
    return snapshot
  }
}

function EventRow({
  event,
  moneyKeys,
  knownTriageIds,
  onSelectTriage,
}: {
  event: MessageTriageEvent
  moneyKeys: ReadonlySet<string> | undefined
  knownTriageIds: ReadonlySet<number>
  onSelectTriage: (id: number) => void
}) {
  const suppression = event.event_type === 'resource_op_suppressed' ? parseSuppression(event.details_json) : null
  const recorded = event.event_type === 'pending_archive_recorded' ? parseRecordedArchive(event.details_json) : null
  const skipped = event.event_type === 'pending_archive_skipped' ? parseSkippedArchive(event.details_json) : null
  return (
    <li className='flex items-baseline gap-3 text-sm'>
      <span className='font-mono text-xs text-muted-foreground'>#{event.sequence_num}</span>
      <span className='font-medium'>{eventLabel(event.event_type)}</span>
      {suppression ?
        <SuppressionEventDetails
          suppression={suppression}
          deferredToMessageId={event.deferred_to_message_id}
          knownTriageIds={knownTriageIds}
          onSelectTriage={onSelectTriage}
        />
      : recorded ?
        <span className='text-xs text-muted-foreground' data-testid='pending-archive-recorded-details'>
          due {absoluteTime(recorded.due_at)} ({timeUntil(recorded.due_at)}) — {formatSeconds(recorded.delay_seconds)}{' '}
          after the Message arrived
        </span>
      : skipped ?
        <span className='text-xs text-muted-foreground' data-testid='pending-archive-skipped-details'>
          {skipReasonText(skipped)}
        </span>
      : <span className='font-mono text-xs text-muted-foreground'>
          {formatEventDetails(event.details_json, moneyKeys)}
        </span>
      }
    </li>
  )
}

/** The `pending_archive_recorded` details an Archive run records (d-grcdd4ov). */
interface RecordedArchiveDetails {
  readonly due_at: number
  readonly delay_seconds: number
}

function parseRecordedArchive(json: string | null): RecordedArchiveDetails | null {
  const parsed = parseDetails(json)
  if (parsed && typeof parsed.due_at === 'number' && typeof parsed.delay_seconds === 'number') {
    return { due_at: parsed.due_at, delay_seconds: parsed.delay_seconds }
  }
  return null
}

/** The reason a due pending Archive made no mailbox call (d-41v9yqvh). */
function parseSkippedArchive(json: string | null): string | null {
  const parsed = parseDetails(json)
  return parsed && typeof parsed.reason === 'string' ? parsed.reason : null
}

function parseDetails(json: string | null): Record<string, unknown> | null {
  if (!json) {
    return null
  }
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Why the mailbox was left alone when the Archive came due. An unrecognised
 * reason renders as it was stored rather than as nothing — a daemon ahead of
 * this build still says something.
 */
function skipReasonText(reason: string): string {
  switch (reason) {
    case 'already_departed':
      return 'the Message had already left the inbox'
    case 'abandoned':
      return 'its Pipeline or Account was deleted'
    case 'pipeline_inactive':
      return 'its Pipeline is no longer active on the Account'
    default:
      return reason
  }
}

/** The `resource_op_suppressed` details the cooldown gate records (d-e9jslw4x). */
interface SuppressionDetails {
  readonly kind: string
  readonly deferred_to_triage_id: number
  readonly deferred_to_operator_id: number
}

function parseSuppression(json: string | null): SuppressionDetails | null {
  if (!json) {
    return null
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (
      typeof parsed.kind === 'string' &&
      typeof parsed.deferred_to_triage_id === 'number' &&
      typeof parsed.deferred_to_operator_id === 'number'
    ) {
      return {
        kind: parsed.kind,
        deferred_to_triage_id: parsed.deferred_to_triage_id,
        deferred_to_operator_id: parsed.deferred_to_operator_id,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * A suppressed push names its kind and the push it deferred to, and the
 * reference resolves to that run's Triage (d-e9jslw4x). A deferral to one of
 * this Message's own Triages (a replay inside the cooldown) selects it in the
 * history list; a deferral to another Message's Triage links to that Message's
 * detail, landing on the deferred-to Triage via `?triage=`. Where the
 * deferred-to Triage is gone (`deferred_to_message_id` null), the identifiers
 * render as text with no dead link.
 */
function SuppressionEventDetails({
  suppression,
  deferredToMessageId,
  knownTriageIds,
  onSelectTriage,
}: {
  suppression: SuppressionDetails
  deferredToMessageId: number | null | undefined
  knownTriageIds: ReadonlySet<number>
  onSelectTriage: (id: number) => void
}) {
  const target = `Triage ${suppression.deferred_to_triage_id}`
  return (
    <span className='text-xs text-muted-foreground' data-testid='suppression-details'>
      cooldown on <span className='font-mono'>{suppression.kind}</span> — deferred to the push from{' '}
      {knownTriageIds.has(suppression.deferred_to_triage_id) ?
        <button
          type='button'
          className='underline underline-offset-2 hover:text-foreground'
          onClick={() => {
            onSelectTriage(suppression.deferred_to_triage_id)
          }}
        >
          {target}
        </button>
      : typeof deferredToMessageId === 'number' ?
        <Link
          to='/inbox/$messageId'
          params={{ messageId: String(deferredToMessageId) }}
          search={{ triage: suppression.deferred_to_triage_id }}
          className='underline underline-offset-2 hover:text-foreground'
        >
          {target}
        </Link>
      : <span>{target}</span>}{' '}
      (run {suppression.deferred_to_operator_id})
    </span>
  )
}

// --- Formatting helpers ---------------------------------------------------

function triggerLabel(triggeredBy: string): string {
  switch (triggeredBy) {
    case 'user_replay':
      return 'Replay'
    case 'poll':
      return 'Poll'
    case 'initial':
      return 'Initial'
    default:
      return triggeredBy
  }
}

const EVENT_LABELS: Record<string, string> = {
  tag_set: 'Tag set',
  resource_op_succeeded: 'Resource op succeeded',
  resource_op_limited: 'Resource op limited',
  resource_op_failed: 'Resource op failed',
  resource_op_suppressed: 'Push suppressed',
  pending_archive_recorded: 'Archive scheduled',
  pending_archive_skipped: 'Pending archive skipped',
}

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType
}

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/** Compact, human resource-usage summary from the run's JSON blob. */
function formatResourceUsage(json: string | null): string[] {
  if (!json) {
    return []
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const out: string[] = []
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        continue
      }
      out.push(`${key}: ${String(value)}`)
    }
    return out
  } catch {
    return []
  }
}

/**
 * Render an event's `details_json` as a compact `k=v` summary. A `tag_set`
 * whose key the Pipeline types as extracted money shows its value in display
 * form (d-u4gpx6ke) — the details are still `{key, value}`, so the money
 * rendering applies to the `value` entry when `key` is money-typed.
 */
function formatEventDetails(json: string | null, moneyKeys?: ReadonlySet<string>): string {
  if (!json) {
    return ''
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const tagKey = typeof parsed.key === 'string' ? parsed.key : null
    return Object.entries(parsed)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) =>
        k === 'value' && tagKey !== null && typeof v === 'string' ?
          `${k}=${displayTagValue(tagKey, v, moneyKeys)}`
        : `${k}=${String(v)}`,
      )
      .join(' ')
  } catch {
    return json
  }
}
