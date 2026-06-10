import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MATCH_FIELD_PREFIXES,
  MATCH_MESSAGE_FIELDS,
  MATCH_OPERATORS,
  MatchExpressionError,
  type RuleBasedTaggerConfig,
  compileMatch,
  ruleBasedTaggerConfigSchema,
} from '@twin-digital/grinbox-shared'
import { GripVertical, HelpCircle, Plus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '../../../components/ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu.js'
import { Input } from '../../../components/ui/input.js'
import { Label } from '../../../components/ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js'
import { Textarea } from '../../../components/ui/textarea.js'
import { type OperatorPreviewResponse, useOperatorPreview } from '../../../lib/pipelines.js'
import { displayFrom } from '../../inbox/list.js'
import { type StructuredMatch, blankStructuredMatch, composeMatch, parseStructuredMatch } from './match-builder.js'
import { ValueEnumField } from './value-enum-field.js'

/**
 * Live-validation debounce (ms). A rule's `match` string settles for this long
 * before it's re-parsed with `compileMatch`, so a flurry of keystrokes is a
 * single parse. Pure client-side — no network. Overridable for deterministic
 * tests (a 0ms debounce avoids fighting RTL `findBy`).
 */
const VALIDATION_DEBOUNCE_MS = 300

/**
 * Live-preview debounce (ms). Edits settle for this long before the draft is
 * re-validated + POSTed (in the Preview tab), so a flurry of keystrokes is a
 * single request. Overridable for tests.
 */
const PREVIEW_DEBOUNCE_MS = 500

/**
 * Rule-based Tagger editor (ui-design.md §4). Output Tag key + value-enum
 * editor, an ordered first-match-wins rule list with add/edit/delete and
 * **drag-to-reorder** (via `@dnd-kit/sortable`), and the required `fallback`
 * default-value field. Edits are local to the draft config the parent panel
 * owns; validation against `ruleBasedTaggerConfigSchema` happens on Save in the
 * panel, not here.
 *
 * Each rule's `match` is a free-text DSL **string** in the saved config. The
 * editor offers two ways to author it: **structured pickers** (field / operator
 * / operand) for the common single-comparison case, and a per-rule **Advanced
 * (free-text)** toggle that reveals the raw expression for the full grammar
 * (`and`/`or`/`not`, parentheses, regex `matches`). The match string stays the
 * source of truth; the pickers compose to/from it.
 *
 * The live-preview pane (behavioral check against recent Triages) renders in the
 * hosting dialog's **Preview tab** — see {@link RuleBasedPreview}.
 */

export interface RuleDraft {
  match: string
  output: string
}

export interface RuleBasedDraft {
  output_tag_key: string
  output_value_enum: string[]
  rules: RuleDraft[]
  fallback: { output: string }
}

export function RuleBasedEditor({
  value,
  onChange,
}: {
  value: RuleBasedDraft
  onChange: (next: RuleBasedDraft) => void
}) {
  const tagKeyId = useId()
  // Stable ids for sortable rows, keyed by row index. Rows have no domain id, so
  // we track a parallel id list that survives reorder/insert/delete.
  const idCounter = useRef(0)
  const rowIds = useRef<string[]>(value.rules.map(() => `rule-${idCounter.current++}`))
  // Keep the id list length in sync if rules changed outside a known mutation.
  while (rowIds.current.length < value.rules.length) {
    rowIds.current.push(`rule-${idCounter.current++}`)
  }
  while (rowIds.current.length > value.rules.length) {
    rowIds.current.pop()
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const setRule = (i: number, patch: Partial<RuleDraft>) => {
    const rules = value.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange({ ...value, rules })
  }
  const addRule = () => {
    rowIds.current.push(`rule-${idCounter.current++}`)
    onChange({
      ...value,
      rules: [...value.rules, { match: '', output: value.output_value_enum[0] ?? '' }],
    })
  }
  const removeRule = (i: number) => {
    rowIds.current.splice(i, 1)
    onChange({ ...value, rules: value.rules.filter((_, idx) => idx !== i) })
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) {
      return
    }
    const from = rowIds.current.indexOf(String(active.id))
    const to = rowIds.current.indexOf(String(over.id))
    if (from < 0 || to < 0) {
      return
    }
    rowIds.current = arrayMove(rowIds.current, from, to)
    onChange({ ...value, rules: arrayMove(value.rules, from, to) })
  }

  const enumValues = value.output_value_enum.filter((v) => v.trim() !== '')

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={tagKeyId}>Output Tag key</Label>
        <Input
          id={tagKeyId}
          className='font-mono'
          placeholder='urgency'
          value={value.output_tag_key}
          onChange={(e) => {
            onChange({ ...value, output_tag_key: e.target.value })
          }}
        />
      </div>

      <div className='space-y-2'>
        <Label>Output values</Label>
        <p className='text-xs text-muted-foreground'>
          The closed set of values this Tagger may emit. Each rule and the fallback must pick one of these.
        </p>
        <ValueEnumField
          idPrefix='rb-enum'
          values={value.output_value_enum}
          onChange={(output_value_enum) => {
            onChange({ ...value, output_value_enum })
          }}
        />
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between gap-2'>
          <Label>Rules</Label>
          <div className='flex items-center gap-3'>
            <span className='text-xs text-muted-foreground'>First match wins · drag to reorder</span>
            <FieldsReference />
          </div>
        </div>
        {value.rules.length === 0 ?
          <p className='rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground'>
            No rules yet — every Message gets the fallback value below.
          </p>
        : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rowIds.current} strategy={verticalListSortingStrategy}>
              <div className='space-y-2'>
                {value.rules.map((rule, i) => {
                  const rowId = rowIds.current[i] ?? `rule-${i}`
                  return (
                    <SortableRule
                      key={rowId}
                      id={rowId}
                      index={i}
                      rule={rule}
                      enumValues={enumValues}
                      onChange={(patch) => {
                        setRule(i, patch)
                      }}
                      onRemove={() => {
                        removeRule(i)
                      }}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        }
        <Button type='button' variant='outline' size='sm' onClick={addRule}>
          <Plus />
          Add rule
        </Button>
      </div>

      <div className='space-y-2 rounded-md border border-border bg-muted/30 p-3'>
        <Label htmlFor={`${tagKeyId}-fallback`}>Fallback (default value)</Label>
        <p className='text-xs text-muted-foreground'>
          Emitted when no rule matches — guarantees the Tag is always produced.
        </p>
        <Select
          value={value.fallback.output || undefined}
          onValueChange={(output) => {
            onChange({ ...value, fallback: { output } })
          }}
        >
          <SelectTrigger id={`${tagKeyId}-fallback`} className='max-w-[12rem] font-mono'>
            <SelectValue placeholder='Select a value' />
          </SelectTrigger>
          <SelectContent>
            {enumValues.map((v) => (
              <SelectItem key={v} value={v} className='font-mono'>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** Field-base options for the field picker: bare message fields + dotted families. */
const FIELD_OPTIONS: {
  value: string
  label: string
  hint: string
  /** A dotted family needs a segment sub-input/picker. */
  isPrefix: boolean
  /** Closed segment list (thread); absent for free-form (header/tag) and bare. */
  segments?: readonly { name: string; hint: string }[]
}[] = [
  ...MATCH_MESSAGE_FIELDS.map((f) => ({
    value: f.name,
    label: f.name,
    hint: f.hint,
    isPrefix: false,
  })),
  ...MATCH_FIELD_PREFIXES.map((p) => ({
    value: p.prefix,
    label: `${p.prefix}.…`,
    hint: p.hint,
    isPrefix: true,
    segments: p.fields,
  })),
]

const FIELD_OPTION_BY_VALUE = new Map(FIELD_OPTIONS.map((o) => [o.value, o]))
const OPERATOR_BY_TOKEN = new Map(MATCH_OPERATORS.map((o) => [o.token, o]))

function SortableRule({
  id,
  index,
  rule,
  enumValues,
  onChange,
  onRemove,
}: {
  id: string
  index: number
  rule: RuleDraft
  enumValues: readonly string[]
  onChange: (patch: Partial<RuleDraft>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // On first render, decide structured vs. advanced from the existing `match`:
  // a lone picker-representable comparison opens structured; anything else
  // (boolean/grouped/regex/unknown, or simply non-parseable) opens advanced so
  // the raw expression is never lost or mangled. The decision is sticky for the
  // row's lifetime; the user can flip it explicitly.
  const [advanced, setAdvanced] = useState(() => parseStructuredMatch(rule.match) === null && rule.match.trim() !== '')
  // The structured working state, seeded from the parse (or a blank comparison).
  const [structured, setStructured] = useState<StructuredMatch>(
    () => parseStructuredMatch(rule.match) ?? blankStructuredMatch(),
  )

  const error = useDebouncedMatchError(rule.match)

  const setStructuredAndCompose = (next: StructuredMatch) => {
    setStructured(next)
    onChange({ match: composeMatch(next) })
  }

  const toggleAdvanced = () => {
    if (advanced) {
      // Returning to structured: only safe if the current free-text is a lone
      // comparison the pickers can model. If it isn't, keep the user in advanced
      // (the toggle is disabled in that case), so this branch always re-seeds.
      const parsed = parseStructuredMatch(rule.match)
      if (parsed) {
        setStructured(parsed)
        // Recompose so the canonical (re-quoted) form is what's stored.
        onChange({ match: composeMatch(parsed) })
        setAdvanced(false)
      }
    } else {
      setAdvanced(true)
    }
  }

  // Once in advanced, the user can return to structured only when the current
  // expression is picker-representable.
  const canReturnToStructured = advanced && parseStructuredMatch(rule.match) !== null

  return (
    <div ref={setNodeRef} style={style} className='rounded-md border border-border bg-card p-2'>
      <div className='flex items-start gap-2'>
        <button
          type='button'
          className='mt-1.5 cursor-grab text-muted-foreground'
          aria-label={`Reorder rule ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-4 w-4' />
        </button>
        <span className='mt-1.5 w-5 text-center text-xs text-muted-foreground'>{index + 1}</span>

        <div className='min-w-0 flex-1 space-y-1.5'>
          {advanced ?
            <AdvancedMatch
              index={index}
              match={rule.match}
              onChange={(match) => {
                onChange({ match })
              }}
            />
          : <StructuredMatchFields index={index} value={structured} onChange={setStructuredAndCompose} />}
          {error ?
            <p role='alert' className='text-xs [color:var(--danger)]' aria-label={`Rule ${index + 1} error`}>
              {error}
            </p>
          : null}
          <div className='flex items-center justify-between gap-2 pt-0.5'>
            <button
              type='button'
              className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50'
              onClick={toggleAdvanced}
              disabled={advanced && !canReturnToStructured}
              title={
                advanced && !canReturnToStructured ?
                  'This expression uses features the pickers can’t model (and/or/not, parentheses, or regex).'
                : undefined
              }
            >
              {advanced ? 'Use pickers' : 'Advanced (free-text)'}
            </button>
          </div>
        </div>

        <div className='flex items-center gap-2 pt-0.5'>
          <span className='text-xs text-muted-foreground'>→</span>
          <Select
            value={rule.output || undefined}
            onValueChange={(output) => {
              onChange({ output })
            }}
          >
            <SelectTrigger aria-label={`Rule ${index + 1} output`} className='h-8 w-28 font-mono text-xs'>
              <SelectValue placeholder='value' />
            </SelectTrigger>
            <SelectContent>
              {enumValues.map((v) => (
                <SelectItem key={v} value={v} className='font-mono'>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            aria-label={`Delete rule ${index + 1}`}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The structured field / operator / operand pickers for one rule. */
function StructuredMatchFields({
  index,
  value,
  onChange,
}: {
  index: number
  value: StructuredMatch
  onChange: (next: StructuredMatch) => void
}) {
  const fieldOpt = FIELD_OPTION_BY_VALUE.get(value.field.base)
  const operatorOpt = OPERATOR_BY_TOKEN.get(value.operator)
  // The hint to surface inline: prefer the operator's, else the field's.
  const segmentHint =
    fieldOpt?.isPrefix && fieldOpt.segments ?
      fieldOpt.segments.find((s) => s.name === value.field.segment)?.hint
    : undefined
  const hint = segmentHint ?? operatorOpt?.hint ?? fieldOpt?.hint

  const setFieldBase = (base: string) => {
    const opt = FIELD_OPTION_BY_VALUE.get(base)
    // Seed a closed-family segment with its first value; clear otherwise.
    const segment = opt?.segments?.[0]?.name ?? ''
    onChange({ ...value, field: { base, segment } })
  }

  return (
    <div className='space-y-1.5'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Select value={value.field.base} onValueChange={setFieldBase}>
          <SelectTrigger aria-label={`Rule ${index + 1} field`} className='h-8 w-36 font-mono text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className='font-mono'>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {fieldOpt?.isPrefix ?
          fieldOpt.segments ?
            <Select
              value={value.field.segment || undefined}
              onValueChange={(segment) => {
                onChange({ ...value, field: { ...value.field, segment } })
              }}
            >
              <SelectTrigger
                aria-label={`Rule ${index + 1} ${value.field.base} field`}
                className='h-8 w-36 font-mono text-xs'
              >
                <SelectValue placeholder='field' />
              </SelectTrigger>
              <SelectContent>
                {fieldOpt.segments.map((s) => (
                  <SelectItem key={s.name} value={s.name} className='font-mono'>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          : <Input
              aria-label={`Rule ${index + 1} ${value.field.base} name`}
              className='h-8 w-36 font-mono text-xs'
              placeholder={value.field.base === 'tag' ? 'key' : 'name'}
              value={value.field.segment}
              onChange={(e) => {
                onChange({
                  ...value,
                  field: { ...value.field, segment: e.target.value },
                })
              }}
            />

        : null}

        <Select
          value={value.operator}
          onValueChange={(operator) => {
            onChange({ ...value, operator })
          }}
        >
          <SelectTrigger aria-label={`Rule ${index + 1} operator`} className='h-8 w-32 font-mono text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_OPERATORS.filter((o) => o.token !== 'matches').map((o) => (
              <SelectItem key={o.token} value={o.token} className='font-mono'>
                {o.token}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          aria-label={`Rule ${index + 1} operand`}
          className='h-8 min-w-0 flex-1 font-mono text-xs'
          placeholder='value'
          value={value.operand}
          onChange={(e) => {
            onChange({ ...value, operand: e.target.value })
          }}
        />
      </div>
      {hint ?
        <p className='text-xs text-muted-foreground'>{hint}</p>
      : null}
    </div>
  )
}

/** The free-text (advanced) match editor for one rule: an auto-growing textarea. */
function AdvancedMatch({
  index,
  match,
  onChange,
}: {
  index: number
  match: string
  onChange: (match: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Auto-grow: reset height then size to content so the box tracks the expression.
  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [match])

  return (
    <Textarea
      ref={ref}
      aria-label={`Rule ${index + 1} match`}
      className='min-h-9 resize-none py-1.5 font-mono text-xs'
      rows={1}
      placeholder='from_domain == "acme.com" and subject contains "invoice"'
      value={match}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    />
  )
}

/**
 * Debounce a `match` string, then parse it with `compileMatch` and return the
 * `MatchExpressionError` message (with its char position), or `null` when it's
 * empty or parses cleanly. Pure client-side — the Preview tab is the behavioral
 * check. An empty match is treated as "incomplete, not an error" so a
 * just-added rule doesn't shout before the user types.
 */
function useDebouncedMatchError(match: string, debounceMs = VALIDATION_DEBOUNCE_MS): string | null {
  const [settled, setSettled] = useState(match)
  useEffect(() => {
    if (debounceMs <= 0) {
      setSettled(match)
      return
    }
    const handle = setTimeout(() => {
      setSettled(match)
    }, debounceMs)
    return () => {
      clearTimeout(handle)
    }
  }, [match, debounceMs])

  if (settled.trim() === '') {
    return null
  }
  try {
    compileMatch(settled)
    return null
  } catch (err) {
    if (err instanceof MatchExpressionError) {
      return err.message
    }
    return err instanceof Error ? err.message : 'Invalid match expression.'
  }
}

/** A help dropdown listing the match vocabulary with worked examples. */
function FieldsReference() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type='button' variant='ghost' size='sm' className='h-7 gap-1.5'>
          <HelpCircle className='h-3.5 w-3.5' />
          Fields &amp; operators
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-h-[28rem] w-[22rem] overflow-y-auto p-3 text-xs'>
        <p className='mb-2 text-sm font-medium text-foreground'>Match fields &amp; operators</p>
        <p className='mb-3 rounded-md border border-border bg-muted/40 p-2 text-muted-foreground'>
          <span className='font-mono'>from</span> is the full header — match an address with{' '}
          <span className='font-mono'>from contains "x@y.com"</span> or{' '}
          <span className='font-mono'>from_email == "x@y.com"</span>.
        </p>

        <p className='mb-1 font-medium text-foreground'>Message fields</p>
        <ul className='mb-3 space-y-1'>
          {MATCH_MESSAGE_FIELDS.map((f) => (
            <li key={f.name}>
              <span className='font-mono text-foreground'>{f.name}</span>{' '}
              <span className='text-muted-foreground'>— {f.hint}</span>
            </li>
          ))}
        </ul>

        <p className='mb-1 font-medium text-foreground'>Field families</p>
        <ul className='mb-3 space-y-1'>
          {MATCH_FIELD_PREFIXES.map((p) => (
            <li key={p.prefix}>
              <span className='font-mono text-foreground'>{p.prefix}.…</span>{' '}
              <span className='text-muted-foreground'>— {p.hint}</span>
            </li>
          ))}
        </ul>

        <p className='mb-1 font-medium text-foreground'>Operators</p>
        <ul className='mb-3 space-y-1'>
          {MATCH_OPERATORS.map((o) => (
            <li key={o.token}>
              <span className='font-mono text-foreground'>{o.token}</span>{' '}
              <span className='text-muted-foreground'>— {o.hint}</span>
            </li>
          ))}
        </ul>

        <p className='mb-1 font-medium text-foreground'>Examples</p>
        <ul className='space-y-1 font-mono text-muted-foreground'>
          <li>from contains "x@y.com"</li>
          <li>from_domain == "acme.com" and subject contains "invoice"</li>
          <li>not (tag.urgency == "low")</li>
        </ul>
        <p className='mt-2 text-muted-foreground'>
          Combine with <span className='font-mono'>and</span> / <span className='font-mono'>or</span> /{' '}
          <span className='font-mono'>not</span> and parentheses in Advanced (free-text) mode.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Live-preview pane (ui-design.md §4), rendered in the hosting dialog's Preview
 * tab. Debounces the draft, and **only when it parses against
 * `ruleBasedTaggerConfigSchema`** evaluates it against the Pipeline's recent
 * Triages via `POST /api/operators/preview`, listing the Messages whose output
 * Tag value would change (`current → draft`). An incomplete/invalid draft never
 * POSTs — it shows a "complete the rule" prompt. Read-only: it never feeds back
 * into the draft or the save flow.
 */
export function RuleBasedPreview({
  pipelineId,
  draft,
  debounceMs = PREVIEW_DEBOUNCE_MS,
}: {
  pipelineId: number
  draft: RuleBasedDraft
  /** Preview debounce in ms; tests pass a small value to avoid timer juggling. */
  debounceMs?: number
}) {
  // Debounce the draft, then validate the settled value. A null `validConfig`
  // (incomplete/invalid draft) keeps the preview query disabled — no POST of a
  // config the server would 400 on.
  const validConfig = useDebouncedValidConfig(draft, debounceMs)
  const query = useOperatorPreview(pipelineId, validConfig)

  return (
    <aside className='space-y-3 rounded-md border border-border bg-muted/20 p-4'>
      <div>
        <p className='text-sm font-medium text-foreground'>Live preview</p>
        <p className='mt-0.5 text-xs text-muted-foreground'>
          Recent Messages whose <span className='font-mono'>{draft.output_tag_key || 'output'}</span> Tag would change.
        </p>
      </div>
      <PreviewBody draft={draft} validConfig={validConfig} query={query} />
    </aside>
  )
}

/**
 * Debounce + client-side validate the draft. Returns the parsed
 * `RuleBasedTaggerConfig` once the draft has settled *and* parses, else `null`.
 * Validating with the same shared schema the server uses means we only ever POST
 * a config the endpoint will accept (modulo a `match` that compiles but throws —
 * which the pane surfaces inline from the server's 400).
 */
function useDebouncedValidConfig(draft: RuleBasedDraft, debounceMs: number): RuleBasedTaggerConfig | null {
  const serialized = JSON.stringify(draft)
  const [settled, setSettled] = useState(serialized)

  useEffect(() => {
    if (debounceMs <= 0) {
      setSettled(serialized)
      return
    }
    const handle = setTimeout(() => {
      setSettled(serialized)
    }, debounceMs)
    return () => {
      clearTimeout(handle)
    }
  }, [serialized, debounceMs])

  const parsed = ruleBasedTaggerConfigSchema.safeParse(JSON.parse(settled))
  return parsed.success ? parsed.data : null
}

function PreviewBody({
  draft,
  validConfig,
  query,
}: {
  draft: RuleBasedDraft
  validConfig: RuleBasedTaggerConfig | null
  query: ReturnType<typeof useOperatorPreview>
}) {
  if (validConfig === null) {
    return (
      <p className='rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground'>
        Complete the rule to preview — set an Output Tag key, at least one value, and a fallback.
      </p>
    )
  }

  if (query.isError) {
    return (
      <p
        role='alert'
        className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs [color:var(--danger)]'
      >
        {query.error.message}
      </p>
    )
  }

  if (query.isPending || query.isFetching) {
    return <p className='px-1 py-2 text-xs text-muted-foreground'>Evaluating…</p>
  }

  const data = query.data
  if (data.total_evaluated === 0) {
    return <p className='px-1 py-2 text-xs text-muted-foreground'>No recent messages to preview against.</p>
  }
  if (data.changed_count === 0) {
    return <p className='px-1 py-2 text-xs text-muted-foreground'>No changes — the draft produces the same values.</p>
  }

  return <PreviewChanges draft={draft} data={data} />
}

function PreviewChanges({ draft, data }: { draft: RuleBasedDraft; data: OperatorPreviewResponse }) {
  const changed = data.results.filter((r) => r.changed)
  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        <span className='font-medium text-foreground'>
          {data.changed_count} of {data.total_evaluated}
        </span>{' '}
        recent messages would change <span className='font-mono'>{draft.output_tag_key}</span>
      </p>
      <ul className='space-y-1.5'>
        {changed.map((r) => (
          <li key={r.message_id} className='rounded-md border border-border bg-card p-2 text-xs'>
            <div className='truncate font-medium' title={r.from ?? undefined}>
              {displayFrom(r.from)}
            </div>
            <div className='truncate text-muted-foreground' title={r.subject ?? undefined}>
              {r.subject ?? '(no subject)'}
            </div>
            <div className='mt-1 flex items-center gap-1.5 font-mono'>
              <span className='text-muted-foreground'>{r.current_value ?? '(none)'}</span>
              <span aria-hidden className='text-muted-foreground'>
                →
              </span>
              <span className='font-medium text-foreground'>{r.draft_value}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
