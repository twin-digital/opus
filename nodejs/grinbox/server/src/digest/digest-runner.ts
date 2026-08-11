/**
 * Executes one claimed digest run: deterministic collation of the coverage
 * window's Messages into the edition's sections, then one metered send
 * (d-r8iz7u3q). All per-Message judgment happened at Triage time (the `digest_category` Tag and
 * any extracted field Tags); this runner selects, groups, renders, reconciles,
 * and sends — it makes zero model calls unless sections opt into `llm` prose
 * blocks.
 *
 * ## Composition
 *
 *  1. Select the window's Messages (by `messages.created_at`, the coverage
 *     axis — ingestion time, so late-ingested mail is digested in the window
 *     it arrived in) with each Message's current-Triage Tags under the
 *     Pipeline; slot by `digest_category` into the edition's sections.
 *  2. Render each non-empty section per its shape: `list` items through
 *     `item_template`, `table` cells per-column, `count` as a count line. A
 *     Message whose rendering is entirely empty falls back to `from — subject`
 *     (in a table, in its first column). `highlight` compares once, by typed
 *     comparison over the normalized stored forms; the mark reads per
 *     rendition (d-7pviv01j) — a ` (!)` suffix in text, styling in the rich
 *     one. A Tag the pipeline types as extracted money renders in display form
 *     (`formatMoneyDisplay`, r-735kq72h), verbatim where the stored value is
 *     not money (d-m6ingqyv); the threshold still compares the stored form
 *     (d-nj43sz9w).
 *  3. **Reconcile**: the sum of rendered section item counts must equal the
 *     selected candidate count — asserted in code; a digest cannot silently
 *     drop a Message. Messages in declared-but-unclaimed categories (claimed
 *     by no enabled edition, and not the category producer's fallback) are
 *     counted per category in a footer line.
 *  4. Section prose (`before`/`after`): `text` inserts verbatim; `llm` makes a
 *     metered model call (the edition's `summary_model_id`) given the
 *     section's rendered items, and is simply omitted on any failure — prose
 *     can never add, remove, or alter items, and never fails the run.
 *  5. Send via the metered `mail_sender.send_message` to the Account owner's own
 *     address — one mail, two renditions of the same content (d-1oqjgi9m): the
 *     plain-text body plus the rich rendition (`rendition.ts`) as the optional
 *     `body_rich` (d-rd986rrt). An empty window (no candidates in any section)
 *     completes without a send.
 *
 * ## Metering
 *
 * The send and any prose model calls go through the standard metered-client
 * factory with `messageId: null` — a digest run has no single subject Message,
 * so `per_message` Limits are not applicable (limits.ts documents this);
 * `per_window` Limits are enforced normally. A denied or failed **send** fails
 * the run (an unsent digest is not a delivered one; the watermark stays so the
 * next occurrence covers the union); a denied or failed **prose** call only
 * omits its block.
 */

import type { DigestDeliveryConfig, DigestProseBlock, DigestSection } from '@grinbox/shared'
import { DIGEST_CATEGORY_TAG_KEY, formatMoneyDisplay } from '@grinbox/shared'
import type { DB, MessagesTable } from '../db/schema.js'
import { comparesOver } from '../operators/built-ins/normalize-extracted.js'
import { renderTemplate } from '../operators/built-ins/template.js'
import { type MessageView, messageViewFromRow } from '../operators/types.js'
import { type ResourceEvent, type UsageDelta, createResourceClientFactory } from '../resources/make-resource-client.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import { moneyTypedTagKeys } from './money-display.js'
import { type RichSectionInput, renderRichDigest } from './rendition.js'

/** The claimed `digest_runs` row plus its resolved scheduling context. */
export interface DigestRunClaim {
  readonly runId: number
  readonly operatorId: number
  readonly operatorName: string
  readonly accountId: number
  readonly pipelineId: number
  readonly userId: number
  readonly config: DigestDeliveryConfig
  readonly coversFrom: number
  readonly coversTo: number
}

export interface DigestRunnerDeps {
  readonly db: DB
  readonly makeClients: MakeUnderlyingClients
  /** Whole-run timeout in ms (config.digestTimeoutMs); aborts in-flight calls. */
  readonly timeoutMs: number
}

export interface DigestRunOutcome {
  readonly status: 'completed' | 'failed'
  readonly messageCount: number
  readonly errorSummary: string | null
}

/**
 * Candidate cap per digest. Keeps one run bounded on a pathological window
 * (a first run over a large backlog); overflow beyond the cap is reported in
 * the digest footer so the truncation is visible in the delivered email.
 */
export const MAX_DIGEST_CANDIDATES = 500

/** Output-token budget for one `llm` prose block. */
const PROSE_MAX_TOKENS = 512

/** The marker appended to a highlighted item / row. */
export const HIGHLIGHT_MARKER = ' (!)'

/** Thrown internally to funnel every failure path into one persisted outcome. */
class DigestRunError extends Error {
  override readonly name = 'DigestRunError'
}

/**
 * Run one claimed digest and persist its outcome. Never throws: any failure
 * (selection, reconciliation, send denial/failure, missing Account address,
 * timeout) is persisted as a `failed` run — the watermark stays, the error
 * surfaces in the Activity feed, and the scheduler moves on.
 */
export async function executeDigestRun(deps: DigestRunnerDeps, claim: DigestRunClaim): Promise<DigestRunOutcome> {
  const events: ResourceEvent[] = []
  const usage: Record<string, Record<string, number>> = {}
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort('digest_timeout')
  }, deps.timeoutMs)

  let messageCount = 0
  try {
    const window = await loadWindow(deps.db, claim)
    messageCount = window.candidates.length

    const ownCategories = new Set(claim.config.sections.map((section) => section.category))
    if (window.candidates.length === 0 && reportedCount(window) === 0) {
      // A window with nothing to show and nothing to report completes (advancing
      // the watermark) without sending — an empty digest is noise (d-dmylyoqs).
      // The test is over the whole window rather than over the candidates: a
      // window holding only mail this edition does not show still owes the
      // accounting, so it sends.
      await finishDigestRun(deps.db, claim.runId, {
        status: 'completed',
        messageCount: 0,
        errorSummary: null,
        usage,
        events,
      })
      return { status: 'completed', messageCount: 0, errorSummary: null }
    }

    const toAddress = await accountOwnAddress(deps.db, claim.accountId)

    const makeResourceClient = createResourceClientFactory({
      db: deps.db,
      userId: claim.userId,
      messageId: null,
      operatorId: claim.operatorId,
      triageId: null,
      signal: controller.signal,
      onEvent: (event) => events.push(event),
      onUsage: (resourceOp, delta) => {
        mergeUsage(usage, resourceOp, delta)
      },
      clients: deps.makeClients({
        accountId: claim.accountId,
        notifyCredentialsId: null,
      }),
    })
    // The digest Contract's declared Resource operations (shared
    // STATIC_RESOURCES.digest_delivery), narrowed the same way runOperator
    // narrows per-Triage clients.
    const llm = makeResourceClient('llm_bedrock', ['invoke_model'])
    const sender = makeResourceClient('mail_sender', ['send_message'])

    const rendered = renderSections(claim.config.sections, window.candidates, window.moneyKeys)

    // Reconciliation invariant (r-vd9mu8od): the items rendered plus every count
    // the digest reports account for the whole window — not for the selection.
    // The selection is category-keyed, so reconciling against it would be true
    // of a selection that lost a Message before either side was counted.
    const renderedCount = rendered.reduce((n, s) => n + s.count, 0)
    const reported = reportedCount(window)
    const elsewhere = accountedElsewhere(window, ownCategories)
    if (renderedCount + reported + elsewhere !== window.coveredTotal) {
      throw new DigestRunError(
        `digest reconciliation failed: rendered ${renderedCount} items, reported ${reported} more, ` +
          `and left ${elsewhere} to a sibling edition or the never-digested value, ` +
          `but the window covers ${window.coveredTotal} messages`,
      )
    }

    // Prose blocks resolve per section through the metered LLM client; a
    // denied/failed call omits its block and never fails the run. Both
    // renditions compose from this one pass — the same items, counts, prose,
    // and footer (d-1oqjgi9m).
    const proseModelId = claim.config.summary_model_id
    const blocks: string[] = []
    const richSections: RichSectionInput[] = []
    for (const section of rendered) {
      if (section.count === 0) {
        continue
      } // empty sections are omitted entirely
      const before = await resolveProse(llm, proseModelId, section.section.before, section)
      const after = await resolveProse(llm, proseModelId, section.section.after, section)
      blocks.push(sectionBlock(section, before, after))
      richSections.push(richSection(section, before, after))
    }

    const footerLines = digestFooterLines(window)
    const body = assembleBody(blocks, digestFooter(window))
    const bodyRich = renderRichDigest(richSections, footerLines)

    const sent = await sender.send_message({
      to: toAddress,
      subject: digestSubject(claim),
      body,
      body_rich: bodyRich,
    })
    if (sent.outcome !== 'succeeded') {
      throw new DigestRunError(
        sent.outcome === 'skipped_by_limit' ?
          `mail_sender.send_message denied by limit ${sent.limit_id} (${sent.scope}); digest not delivered`
        : `mail_sender.send_message failed: ${sent.error.message}`,
      )
    }

    await finishDigestRun(deps.db, claim.runId, {
      status: 'completed',
      messageCount,
      errorSummary: null,
      usage,
      events,
    })
    return { status: 'completed', messageCount, errorSummary: null }
  } catch (err) {
    const errorSummary =
      controller.signal.aborted ? `digest timed out after ${deps.timeoutMs}ms`
      : err instanceof Error ? err.message
      : String(err)
    await finishDigestRun(deps.db, claim.runId, {
      status: 'failed',
      messageCount,
      errorSummary,
      usage,
      events,
    })
    return { status: 'failed', messageCount, errorSummary }
  } finally {
    clearTimeout(timer)
  }
}

// --- Selection -------------------------------------------------------------

/** One candidate: the Message view + its current-Triage Tags + its category. */
export interface DigestCandidate {
  readonly message: MessageView
  readonly tags: ReadonlyMap<string, string>
  readonly category: string
}

/** The loaded coverage window, ready for composition. */
export interface DigestWindow {
  /** Messages whose category one of this edition's sections claims (capped). */
  readonly candidates: readonly DigestCandidate[]
  /** Per-category Message counts across the whole window (uncapped). */
  readonly categoryCounts: ReadonlyMap<string, number>
  /** Categories claimed by this or any sibling enabled edition. */
  readonly claimedCategories: ReadonlySet<string>
  /** The category producer's fallback output ("never digested"), if derivable. */
  readonly fallbackCategory: string | null
  /** Matching candidates beyond {@link MAX_DIGEST_CANDIDATES} not selected. */
  readonly truncatedOverflow: number
  /**
   * Messages the window covers that carry no `digest_category` Tag at all —
   * their Triage failed before the producer ran, settled without it, or the
   * Pipeline carried no producer when it ran. They are the account's mail inside
   * the window (d-jsnfvo0m) and so are covered, but no category-keyed selection
   * can see them.
   */
  readonly uncategorized: number
  /** Every Message the window covers, whatever its Tags. */
  readonly coveredTotal: number
  /** Tag keys the pipeline's enabled operators type as extracted money. */
  readonly moneyKeys: ReadonlySet<string>
}

/**
 * Load the window: per-category counts, the capped candidate set for this
 * edition's categories (each with its full current-Triage Tag map, oldest
 * first), and the Pipeline context the footer needs (sibling editions'
 * claimed categories; the category producer's fallback output).
 */
async function loadWindow(db: DB, claim: DigestRunClaim): Promise<DigestWindow> {
  const sectionCategories = claim.config.sections.map((s) => s.category)

  // Per-category counts over the whole window (drives the footer and the
  // truncation math; NOT capped).
  const countRows = await db
    .selectFrom('messages')
    .innerJoin('current_triages', 'current_triages.message_id', 'messages.id')
    .innerJoin('tags', 'tags.triage_id', 'current_triages.triage_id')
    .select(({ fn }) => ['tags.value as category', fn.countAll<number>().as('n')])
    .where('messages.account_id', '=', claim.accountId)
    .where('messages.created_at', '>', claim.coversFrom)
    .where('messages.created_at', '<=', claim.coversTo)
    .where('current_triages.pipeline_id', '=', claim.pipelineId)
    .where('tags.key', '=', DIGEST_CATEGORY_TAG_KEY)
    .groupBy('tags.value')
    .execute()
  const categoryCounts = new Map<string, number>()
  for (const row of countRows) {
    categoryCounts.set(row.category, row.n)
  }

  // Candidate Messages for this edition's categories, oldest first, capped.
  const candidateRows = await db
    .selectFrom('messages')
    .innerJoin('current_triages', 'current_triages.message_id', 'messages.id')
    .innerJoin('tags', 'tags.triage_id', 'current_triages.triage_id')
    .selectAll('messages')
    .select(['current_triages.triage_id as triage_id', 'tags.value as category'])
    .where('messages.account_id', '=', claim.accountId)
    .where('messages.created_at', '>', claim.coversFrom)
    .where('messages.created_at', '<=', claim.coversTo)
    .where('current_triages.pipeline_id', '=', claim.pipelineId)
    .where('tags.key', '=', DIGEST_CATEGORY_TAG_KEY)
    .where('tags.value', 'in', sectionCategories)
    .orderBy('messages.created_at', 'asc')
    .orderBy('messages.id', 'asc')
    .limit(MAX_DIGEST_CANDIDATES)
    .execute()

  // Full Tag maps for the candidates' Triages (templates read any Tag).
  const triageIds = [...new Set(candidateRows.map((r) => r.triage_id))]
  const tagsByTriage = new Map<number, Map<string, string>>()
  if (triageIds.length > 0) {
    const tagRows = await db
      .selectFrom('tags')
      .select(['triage_id', 'key', 'value'])
      .where('triage_id', 'in', triageIds)
      .execute()
    for (const t of tagRows) {
      const bucket = tagsByTriage.get(t.triage_id) ?? new Map<string, string>()
      bucket.set(t.key, t.value)
      tagsByTriage.set(t.triage_id, bucket)
    }
  }

  const candidates: DigestCandidate[] = candidateRows.map((row) => ({
    message: messageViewFromRow(row as unknown as MessagesTable),
    tags: tagsByTriage.get(row.triage_id) ?? new Map(),
    category: row.category,
  }))

  const matchingTotal = sectionCategories.reduce((n, c) => n + (categoryCounts.get(c) ?? 0), 0)

  // Coverage is the account's mail in the window, not the tag-joined subset of
  // it (d-jsnfvo0m). Counting it separately is what lets the reconciliation see
  // a Message no category-keyed query returns.
  const coveredRow = await db
    .selectFrom('messages')
    .select(({ fn }) => fn.countAll<number>().as('n'))
    .where('account_id', '=', claim.accountId)
    .where('created_at', '>', claim.coversFrom)
    .where('created_at', '<=', claim.coversTo)
    .executeTakeFirst()
  const coveredTotal = coveredRow?.n ?? 0
  const categorizedTotal = [...categoryCounts.values()].reduce((n, c) => n + c, 0)

  const pipelineContext = await loadPipelineContext(db, claim)

  return {
    candidates,
    categoryCounts,
    claimedCategories: pipelineContext.claimedCategories,
    fallbackCategory: pipelineContext.fallbackCategory,
    truncatedOverflow: Math.max(0, matchingTotal - candidates.length),
    uncategorized: Math.max(0, coveredTotal - categorizedTotal),
    coveredTotal,
    moneyKeys: pipelineContext.moneyKeys,
  }
}

/**
 * Pipeline context for composition: the categories claimed by any enabled
 * digest edition (this one included), the `digest_category` producer's
 * fallback output — the "never digested" value a Rule-based producer emits
 * when no routing Rule matches — and the Tag keys typed as extracted money
 * (d-m6ingqyv). All derive from the Pipeline's current enabled Operator
 * configs; a config that doesn't parse contributes nothing (the footer
 * degrades to counting more categories, never to dropping Messages).
 */
async function loadPipelineContext(
  db: DB,
  claim: DigestRunClaim,
): Promise<{
  claimedCategories: ReadonlySet<string>
  fallbackCategory: string | null
  moneyKeys: ReadonlySet<string>
}> {
  const rows = await db
    .selectFrom('operators')
    .select(['type_key', 'config_json'])
    .where('pipeline_id', '=', claim.pipelineId)
    .where('enabled', '=', 1)
    .where('deleted_at', 'is', null)
    .execute()

  const claimedCategories = new Set<string>(claim.config.sections.map((s) => s.category))
  let fallbackCategory: string | null = null
  for (const row of rows) {
    const parsed = safeJsonParse(row.config_json)
    if (!parsed || typeof parsed !== 'object') {
      continue
    }
    if (row.type_key === 'digest_delivery') {
      const sections = (parsed as { sections?: unknown }).sections
      if (Array.isArray(sections)) {
        for (const section of sections) {
          const category = (section as { category?: unknown }).category
          if (typeof category === 'string') {
            claimedCategories.add(category)
          }
        }
      }
    }
    if (row.type_key === 'rule_based_tagger') {
      const c = parsed as {
        output_tag_key?: unknown
        fallback?: { output?: unknown }
      }
      if (c.output_tag_key === DIGEST_CATEGORY_TAG_KEY && typeof c.fallback?.output === 'string') {
        fallbackCategory = c.fallback.output
      }
    }
  }
  return { claimedCategories, fallbackCategory, moneyKeys: moneyTypedTagKeys(rows) }
}

// --- Rendering (pure) ------------------------------------------------------

/** One rendered `list` item, unmarked: the mark reads per rendition (d-7pviv01j). */
export interface RenderedItem {
  readonly text: string
  readonly marked: boolean
}

/** One rendered `table` row, cells without the mark. */
export interface RenderedRow {
  readonly cells: readonly string[]
  readonly marked: boolean
}

/** One section's deterministic rendering — one accounting, both renditions. */
export interface RenderedSection {
  readonly section: DigestSection
  /** `list` items (empty for other shapes). */
  readonly items: readonly RenderedItem[]
  /** `table` rows (empty for other shapes). */
  readonly rows: readonly RenderedRow[]
  /**
   * The text rendition's item/row lines (empty for `count` sections): the mark
   * suffixed as ` (!)`, a table led by its header + separator rows.
   */
  readonly lines: readonly string[]
  /** Messages this section accounts for (= its candidates). */
  readonly count: number
}

/**
 * Group the candidates by section and render each per its shape. Every
 * candidate lands in exactly one section (selection guaranteed category
 * membership; an edition claims each category at most once), so the
 * reconciliation invariant reduces to comparing totals. Pure — given the same
 * candidates, sections, and money-typed keys, the output is identical.
 */
export function renderSections(
  sections: readonly DigestSection[],
  candidates: readonly DigestCandidate[],
  moneyKeys: ReadonlySet<string> = new Set(),
): RenderedSection[] {
  const byCategory = new Map<string, DigestCandidate[]>()
  for (const candidate of candidates) {
    const list = byCategory.get(candidate.category)
    if (list) {
      list.push(candidate)
    } else {
      byCategory.set(candidate.category, [candidate])
    }
  }

  return sections.map((section) => {
    const members = byCategory.get(section.category) ?? []
    switch (section.render) {
      case 'list': {
        const items = members.map((m) => renderListItem(section, m, moneyKeys))
        return {
          section,
          count: members.length,
          items,
          rows: [],
          lines: items.map((item) => `- ${item.text}${item.marked ? HIGHLIGHT_MARKER : ''}`),
        }
      }
      case 'table': {
        const rows = members.map((m) => renderTableRow(section, m, moneyKeys))
        return {
          section,
          count: members.length,
          items: [],
          rows,
          lines: members.length === 0 ? [] : renderTableLines(section, rows),
        }
      }
      case 'count':
        return { section, count: members.length, items: [], rows: [], lines: [] }
    }
  })
}

/**
 * The Tag map a template renders from: keys the pipeline types as extracted
 * money render in display form (r-735kq72h), verbatim where the stored value
 * is not money (d-m6ingqyv). Rendered here at composition, never stored
 * (d-nj43sz9w) — the highlight comparison reads the stored map.
 */
function displayTags(tags: ReadonlyMap<string, string>, moneyKeys: ReadonlySet<string>): ReadonlyMap<string, string> {
  if (moneyKeys.size === 0) {
    return tags
  }
  const out = new Map(tags)
  for (const key of moneyKeys) {
    const stored = out.get(key)
    if (stored !== undefined) {
      out.set(key, formatMoneyDisplay(stored) ?? stored)
    }
  }
  return out
}

/**
 * Render one `list` item: the `item_template` over the Message + its display
 * Tags, falling back to `from — subject` when the rendering is entirely
 * empty; `marked` when the typed comparison over the stored forms fires.
 */
function renderListItem(
  section: DigestSection,
  candidate: DigestCandidate,
  moneyKeys: ReadonlySet<string>,
): RenderedItem {
  const template = section.item_template ?? ''
  const rendered = renderTemplate(template, candidate.message, displayTags(candidate.tags, moneyKeys)).trim()
  return {
    text: rendered.length > 0 ? rendered : fallbackLine(candidate.message),
    marked: isHighlighted(section, candidate),
  }
}

/**
 * Render one `table` row: each cell rendered independently through its
 * column's template over the display Tags. A Message whose cells are ALL
 * empty gets the fallback line in its first column.
 */
function renderTableRow(
  section: DigestSection,
  candidate: DigestCandidate,
  moneyKeys: ReadonlySet<string>,
): RenderedRow {
  const columns = section.columns ?? []
  const cells = columns.map((column) =>
    renderTemplate(column.template, candidate.message, displayTags(candidate.tags, moneyKeys)).trim(),
  )
  if (cells.every((cell) => cell.length === 0)) {
    cells[0] = fallbackLine(candidate.message)
  }
  return { cells, marked: isHighlighted(section, candidate) }
}

/**
 * The text rendition's `table` lines: a header row, a separator, and one row
 * per Message; a marked row carries the ` (!)` suffix on its last cell.
 */
function renderTableLines(section: DigestSection, rows: readonly RenderedRow[]): string[] {
  const columns = section.columns ?? []
  const row = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`
  const lines = [row(columns.map((c) => c.header)), row(columns.map(() => '---'))]
  for (const rendered of rows) {
    const cells = [...rendered.cells]
    if (rendered.marked && cells.length > 0) {
      cells[cells.length - 1] = `${cells[cells.length - 1]}${HIGHLIGHT_MARKER}`.trim()
    }
    lines.push(row(cells))
  }
  return lines
}

/** `from — subject`, degrading to whichever exists, else the backend id. */
function fallbackLine(message: MessageView): string {
  const parts = [message.from, message.subject].filter((p): p is string => typeof p === 'string' && p.length > 0)
  return parts.length > 0 ? parts.join(' — ') : `(message ${message.backendMessageId})`
}

/** Typed strictly-greater highlight comparison over normalized stored forms. */
function isHighlighted(section: DigestSection, candidate: DigestCandidate): boolean {
  if (!section.highlight) {
    return false
  }
  const value = candidate.tags.get(section.highlight.tag_key)
  return value !== undefined && comparesOver(value, section.highlight.over)
}

/**
 * The same section as {@link sectionBlock} composes, shaped for the rich
 * rendition (d-1oqjgi9m): unmarked items/rows with their `marked` flags —
 * styling is the rich rendition's own reading of the mark (d-7pviv01j) — and
 * the identical resolved prose. Escaping is rendition.ts's job (d-h5ycq7rm).
 */
function richSection(rendered: RenderedSection, before: string | null, after: string | null): RichSectionInput {
  return {
    title: rendered.section.title,
    proseBefore: before,
    proseAfter: after,
    render: rendered.section.render,
    items: rendered.items,
    columns: (rendered.section.columns ?? []).map((c) => c.header),
    rows: rendered.rows,
    count: rendered.count,
  }
}

/** One section's final text block: title, optional prose, items/count. */
function sectionBlock(rendered: RenderedSection, before: string | null, after: string | null): string {
  const parts: string[] = [`## ${rendered.section.title}`]
  if (before) {
    parts.push(before)
  }
  if (rendered.section.render === 'count') {
    parts.push(`${rendered.count} message${rendered.count === 1 ? '' : 's'}`)
  } else {
    parts.push(rendered.lines.join('\n'))
  }
  if (after) {
    parts.push(after)
  }
  return parts.join('\n\n')
}

/**
 * Everything the window covers that this delivery does not show and reports as a
 * count: Messages in categories no enabled edition claims, Messages the item
 * bound cut, and Messages carrying no category at all.
 */
export function reportedCount(window: DigestWindow): number {
  let unclaimed = 0
  for (const [category, count] of window.categoryCounts) {
    if (window.claimedCategories.has(category) || category === window.fallbackCategory) {
      continue
    }
    unclaimed += count
  }
  return unclaimed + window.truncatedOverflow + window.uncategorized
}

/**
 * What the window covers that this delivery owes no accounting for: mail a
 * sibling edition claims and will show in its own delivery (editions claim
 * disjoint categories, d-nfsr4h6f), and mail on the slotting tag's fallback
 * value, which means never digested — the one exclusion d-tm2dbemu allows.
 */
export function accountedElsewhere(window: DigestWindow, ownCategories: ReadonlySet<string>): number {
  let elsewhere = 0
  for (const [category, count] of window.categoryCounts) {
    if (
      category === window.fallbackCategory ||
      (window.claimedCategories.has(category) && !ownCategories.has(category))
    ) {
      elsewhere += count
    }
  }
  return elsewhere
}

/**
 * The digest footer, one line per report: Messages in categories with no
 * claiming section (on any enabled edition; the producer's fallback "never
 * digested" value excluded) counted per category, the Messages carrying no
 * category at all, plus a truncation note when the candidate cap cut the
 * selection. Empty when there is nothing to report. Both renditions carry the
 * same lines (d-1oqjgi9m).
 */
export function digestFooterLines(window: DigestWindow): string[] {
  const unclaimed: string[] = []
  let unclaimedTotal = 0
  for (const [category, count] of [...window.categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (window.claimedCategories.has(category)) {
      continue
    }
    if (category === window.fallbackCategory) {
      continue
    }
    unclaimed.push(`${category} (${count})`)
    unclaimedTotal += count
  }
  const lines: string[] = []
  if (unclaimedTotal > 0) {
    lines.push(
      `Also in this window: ${unclaimedTotal} message${unclaimedTotal === 1 ? '' : 's'} ` +
        `in categories with no section: ${unclaimed.join(', ')}`,
    )
  }
  if (window.truncatedOverflow > 0) {
    lines.push(
      `${window.truncatedOverflow} more message${window.truncatedOverflow === 1 ? '' : 's'} ` +
        `beyond the ${MAX_DIGEST_CANDIDATES}-item cap not shown`,
    )
  }
  if (window.uncategorized > 0) {
    lines.push(
      `${window.uncategorized} message${window.uncategorized === 1 ? '' : 's'} ` +
        `uncategorized: triage recorded no digest category for ${window.uncategorized === 1 ? 'it' : 'them'}`,
    )
  }
  return lines
}

/** The text rendition's footer block: {@link digestFooterLines} joined, or `null`. */
export function digestFooter(window: DigestWindow): string | null {
  const lines = digestFooterLines(window)
  return lines.length > 0 ? lines.join('\n') : null
}

/** Join section blocks (and the optional footer) into the email body. */
function assembleBody(blocks: readonly string[], footer: string | null): string {
  const parts = [...blocks]
  if (footer) {
    parts.push(`—\n${footer}`)
  }
  return parts.join('\n\n')
}

// --- Prose blocks ----------------------------------------------------------

/** The minimal metered LLM surface the prose resolver needs. */
interface ProseLlmClient {
  invoke_model(args: {
    modelId: string
    prompt: string
    maxTokens?: number
  }): Promise<{ outcome: 'succeeded'; value: { text: string } } | { outcome: string }>
}

/**
 * Resolve one prose block. `text` is verbatim. `llm` invokes the edition's
 * `summary_model_id` with the block's prompt plus the section's rendered items
 * as context; any non-success (or a null model id — schema-guarded, belt and
 * suspenders) omits the block. Prose can never alter items or fail the run.
 */
async function resolveProse(
  llm: ProseLlmClient,
  modelId: string | null,
  block: DigestProseBlock | undefined,
  rendered: RenderedSection,
): Promise<string | null> {
  if (!block) {
    return null
  }
  if (block.kind === 'text') {
    return block.text
  }
  if (modelId === null) {
    return null
  }
  try {
    const items = rendered.section.render === 'count' ? `${rendered.count} messages` : rendered.lines.join('\n')
    const result = await llm.invoke_model({
      modelId,
      prompt: `${block.prompt}\n\nSection "${rendered.section.title}" items:\n${items}`,
      maxTokens: PROSE_MAX_TOKENS,
    })
    if (result.outcome !== 'succeeded') {
      return null
    }
    const text = (result as { value: { text: string } }).value.text.trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

// --- Persistence & misc ----------------------------------------------------

/**
 * The digest email subject: the Operator's name plus the coverage end date,
 * rendered in the configured timezone (falling back to the host zone).
 */
export function digestSubject(claim: {
  readonly operatorName: string
  readonly coversTo: number
  readonly config: { readonly timezone?: string }
}): string {
  // en-CA renders YYYY-MM-DD. The timezone was validated at Operator save.
  const date = new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'short',
    ...(claim.config.timezone ? { timeZone: claim.config.timezone } : {}),
  }).format(new Date(claim.coversTo * 1000))
  return `${claim.operatorName} — ${date}`
}

/**
 * Resolve the Account owner's own address from `accounts.settings_json`
 * (`{ email }` for Gmail). Missing/unparseable → the run fails: there is no
 * safe fallback recipient for an automated send.
 */
async function accountOwnAddress(db: DB, accountId: number): Promise<string> {
  const row = await db.selectFrom('accounts').select(['settings_json']).where('id', '=', accountId).executeTakeFirst()
  let email: unknown
  try {
    email = row ? (JSON.parse(row.settings_json) as { email?: unknown }).email : undefined
  } catch {
    email = undefined
  }
  if (typeof email !== 'string' || email.length === 0) {
    throw new DigestRunError(`account ${accountId} has no owner address in settings_json; cannot deliver digest`)
  }
  return email
}

/** Persist a run's terminal state onto its `digest_runs` row. */
async function finishDigestRun(
  db: DB,
  runId: number,
  outcome: {
    status: 'completed' | 'failed'
    messageCount: number
    errorSummary: string | null
    usage: Record<string, Record<string, number>>
    events: readonly ResourceEvent[]
  },
): Promise<void> {
  await db
    .updateTable('digest_runs')
    .set({
      status: outcome.status,
      finished_at: nowSeconds(),
      message_count: outcome.messageCount,
      error_summary: outcome.errorSummary,
      resource_usage_json: Object.keys(outcome.usage).length > 0 ? JSON.stringify(outcome.usage) : null,
      events_json: outcome.events.length > 0 ? JSON.stringify(outcome.events) : null,
    })
    .where('id', '=', runId)
    .execute()
}

function mergeUsage(usage: Record<string, Record<string, number>>, resourceOp: string, delta: UsageDelta): void {
  const bucket = usage[resourceOp] ?? {}
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number') {
      bucket[k] = (bucket[k] ?? 0) + v
    }
  }
  usage[resourceOp] = bucket
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
