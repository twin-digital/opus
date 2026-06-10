import type { CurrentTag } from '@twin-digital/grinbox-server'
import { gmailMessageUrl } from '@twin-digital/grinbox-shared'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Page } from '../../components/page.js'
import { SourceStateBadge } from '../../components/source-state-badge.js'
import { TagChip } from '../../components/tag-chip.js'
import { TriageStatusIndicator } from '../../components/triage-status-indicator.js'
import { Button } from '../../components/ui/button.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.js'
import { relativeTime } from '../../lib/format.js'
import {
  type MessageDetail,
  type MessageTriage,
  type MessageTriageEvent,
  type MessageTriageRun,
  errorMessage,
  useMessage,
  useReplayMessage,
} from '../../lib/messages.js'

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
      : <MessageDetailView detail={data} messageId={id} />}
    </Page>
  )
}

function MessageDetailView({ detail, messageId }: { detail: MessageDetail; messageId: number }) {
  const { message, current_tags, triages } = detail

  return (
    <div>
      <header className='mb-6'>
        <div className='flex items-start justify-between gap-4'>
          <h1 className='flex items-center gap-2 text-2xl font-semibold tracking-tight'>
            {message.subject ?? '(no subject)'}
            <SourceStateBadge state={message.source_state} />
          </h1>
          {message.backend_message_id ?
            <a
              href={gmailMessageUrl(message.backend_message_id)}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'
            >
              <ExternalLink className='h-4 w-4' />
              Open in Gmail
            </a>
          : null}
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
      </header>

      <Tabs defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='tags'>Tags</TabsTrigger>
          <TabsTrigger value='triage'>Triage history</TabsTrigger>
        </TabsList>

        <TabsContent value='overview'>
          <OverviewTab currentTags={current_tags} triages={triages} messageId={messageId} />
        </TabsContent>

        <TabsContent value='tags'>
          <TagsTab triages={triages} />
        </TabsContent>

        <TabsContent value='triage'>
          <TriageHistoryTab triages={triages} />
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
}: {
  currentTags: readonly CurrentTag[]
  triages: readonly MessageTriage[]
  messageId: number
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
                  value={tag.value}
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

function TagsTab({ triages }: { triages: readonly MessageTriage[] }) {
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
              <TagChip tagKey={tag.key} value={tag.value} provenance={provenance} />
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

function TriageHistoryTab({ triages }: { triages: readonly MessageTriage[] }) {
  // Latest Triage selected by default (the list is most-recent-first).
  const [selectedId, setSelectedId] = useState<number | null>(triages[0]?.id ?? null)

  const first = triages[0]
  if (triages.length === 0) {
    return <p className='text-sm text-muted-foreground'>No Triages have run against this Message yet.</p>
  }

  const selected = triages.find((t) => t.id === selectedId) ?? first

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

      <TriageDetailPanel triage={selected} />
    </div>
  )
}

function TriageDetailPanel({ triage }: { triage: MessageTriage }) {
  return (
    <div className='space-y-6'>
      <section>
        <h3 className='mb-2 text-sm font-semibold'>Operator runs ({triage.operator_runs.length})</h3>
        {triage.operator_runs.length === 0 ?
          <p className='text-sm text-muted-foreground'>No Operator runs.</p>
        : <ul className='space-y-2'>
            {triage.operator_runs.map((run) => (
              <OperatorRunRow key={run.operator_id} run={run} />
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
              <EventRow key={`${ev.operator_id}:${ev.sequence_num}`} event={ev} />
            ))}
          </ol>
        }
      </section>
    </div>
  )
}

function OperatorRunRow({ run }: { run: MessageTriageRun }) {
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
        {formatResourceUsage(run.resource_usage_json).map((u) => (
          <span key={u}>{u}</span>
        ))}
      </div>
    </li>
  )
}

function EventRow({ event }: { event: MessageTriageEvent }) {
  return (
    <li className='flex items-baseline gap-3 text-sm'>
      <span className='font-mono text-xs text-muted-foreground'>#{event.sequence_num}</span>
      <span className='font-medium'>{eventLabel(event.event_type)}</span>
      <span className='font-mono text-xs text-muted-foreground'>{formatEventDetails(event.details_json)}</span>
    </li>
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
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint'
      ) {
        continue
      }
      out.push(`${key}: ${String(value)}`)
    }
    return out
  } catch {
    return []
  }
}

/** Render an event's `details_json` as a compact `k=v` summary. */
function formatEventDetails(json: string | null): string {
  if (!json) {
    return ''
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    return Object.entries(parsed)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ')
  } catch {
    return json
  }
}
