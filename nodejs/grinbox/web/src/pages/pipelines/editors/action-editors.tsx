import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCredentials } from '@/lib/pipelines'
import { ModelOptionItems } from './model-options'
import { ValueEnumField } from './value-enum-field'

/**
 * Editors for the Action Operator types (ui-design.md §4: "simpler config form
 * per Action type"). Each owns a draft config slice the parent panel validates
 * against the matching `operatorConfigSchemas` entry on Save.
 *
 *  - Notify: message template + Pushover Credential picker.
 *  - Apply Category: category-name template.
 *  - Archive: the optional delay + the optional firing gate.
 *  - Digest delivery: cron schedule/timezone + the sections list (category,
 *    render shape, templates, highlight, prose blocks) + summary model.
 */

/**
 * The optional firing gate an Action draft carries (mirrors `actionWhenSchema`
 * in `@grinbox/shared`). Absent on the draft ⇒ no `when` key in the saved config
 * ⇒ the Action always fires; present ⇒ fires only when the input Tag for
 * `tag_key` is one of `equals`. Kept on the draft as `tag_key`/`equals` (with a
 * possibly-empty/whitespace `equals` mid-edit); the gate is omitted from the
 * saved config when disabled, and the shared Zod schema enforces non-empty
 * `tag_key` + `equals` on Save.
 */
export interface ActionWhenDraft {
  tag_key: string
  equals: string[]
}

export interface NotifyDraft {
  message_template: string
  credentials_id: number
  /** Optional notification kind (d-vn2jdxbs); absent ⇒ omitted from the saved config. */
  notification_kind?: string
  when?: ActionWhenDraft
}

export function NotifyEditor({ value, onChange }: { value: NotifyDraft; onChange: (next: NotifyDraft) => void }) {
  const msgId = useId()
  const credId = useId()
  const kindId = useId()
  const { data: credentials, isPending } = useCredentials('pushover')
  const hasCredentials = (credentials?.length ?? 0) > 0
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={msgId}>Message template</Label>
        <p className='text-xs text-muted-foreground'>The push body. Message fields are interpolated at send time.</p>
        <Textarea
          id={msgId}
          className='min-h-24 font-mono text-xs'
          placeholder='High-urgency mail from {{from}}: {{subject}}'
          value={value.message_template}
          onChange={(e) => {
            onChange({ ...value, message_template: e.target.value })
          }}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={credId}>Pushover Credential</Label>
        <p className='text-xs text-muted-foreground'>
          The saved notification Credential to send through. Manage Credentials under Settings → Notification
          credentials.
        </p>
        {isPending ?
          <p className='text-sm text-muted-foreground'>Loading Credentials…</p>
        : hasCredentials ?
          <Select
            value={value.credentials_id > 0 ? String(value.credentials_id) : ''}
            onValueChange={(v) => {
              onChange({ ...value, credentials_id: Number(v) })
            }}
          >
            <SelectTrigger id={credId} className='max-w-md'>
              <SelectValue placeholder='Select a Credential' />
            </SelectTrigger>
            <SelectContent>
              {credentials?.map((cred) => (
                <SelectItem key={cred.id} value={String(cred.id)}>
                  {pushoverCredentialLabel(cred)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        : <p className='text-sm [color:var(--warning)]'>
            No Pushover Credentials yet. Add one under Settings → Notification credentials, then come back to select it
            here.
          </p>
        }
      </div>
      <div className='space-y-2'>
        <Label htmlFor={kindId}>Notification kind (optional)</Label>
        <p className='text-xs text-muted-foreground'>
          A short name grouping pushes that should not pile up — Operators naming the same kind share one cooldown (set
          under Settings → Notification cooldowns). Leave blank and this Operator's pushes are grouped with nothing.
        </p>
        <Input
          id={kindId}
          className='max-w-md'
          placeholder='Bank alerts'
          value={value.notification_kind ?? ''}
          onChange={(e) => {
            // Blank ⇒ the key is omitted from the saved config (d-vn2jdxbs: an
            // Operator naming no kind stands alone). Kept as typed while
            // editing; the shared schema trims surrounding whitespace on Save
            // (d-p8xrn2ce).
            const kind = e.target.value
            const { notification_kind: _drop, ...rest } = value
            onChange(kind.trim().length > 0 ? { ...rest, notification_kind: kind } : rest)
          }}
        />
      </div>
      <ActionWhenField
        value={value.when}
        onChange={(when) => {
          onChange({ ...value, when })
        }}
      />
    </div>
  )
}

/**
 * Human label for a Pushover Credential in the picker. There's no nickname
 * field, so we surface the id (the stored reference) plus its creation date.
 */
function pushoverCredentialLabel(cred: { id: number; created_at: number }): string {
  const created = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(cred.created_at * 1000))
  return `Pushover credential #${cred.id} (added ${created})`
}

export interface ApplyCategoryDraft {
  category_template: string
  when?: ActionWhenDraft
}

export function ApplyCategoryEditor({
  value,
  onChange,
}: {
  value: ApplyCategoryDraft
  onChange: (next: ApplyCategoryDraft) => void
}) {
  const catId = useId()
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={catId}>Category name</Label>
        <p className='text-xs text-muted-foreground'>
          The Grinbox-owned Category to apply (Gmail: a label). May be templated from Message fields.
        </p>
        <Input
          id={catId}
          className='max-w-md font-mono'
          placeholder='Grinbox/{{category}}'
          value={value.category_template}
          onChange={(e) => {
            onChange({ ...value, category_template: e.target.value })
          }}
        />
      </div>
      <ActionWhenField
        value={value.when}
        onChange={(when) => {
          onChange({ ...value, when })
        }}
      />
    </div>
  )
}

export interface ArchiveDraft {
  /**
   * Optional delay (d-grcdd4ov): whole seconds, at least 1, no ceiling. Absent
   * ⇒ the key is omitted from the saved config and the Message is archived
   * during the Triage this Operator runs in. Held as a number so the draft goes
   * to `archiveConfigSchema` unchanged; text that is not a number reaches the
   * schema as `NaN` and is refused on Save rather than silently dropped.
   */
  delay_seconds?: number
  when?: ActionWhenDraft
}

export function ArchiveEditor({ value, onChange }: { value: ArchiveDraft; onChange: (next: ArchiveDraft) => void }) {
  const delayId = useId()
  // The raw text is local so a half-typed entry survives re-render; the draft
  // carries the parsed number (or no key at all when the field is empty).
  const [delayText, setDelayText] = useState(value.delay_seconds === undefined ? '' : String(value.delay_seconds))

  const setDelay = (text: string) => {
    setDelayText(text)
    const { delay_seconds: _drop, ...rest } = value
    onChange(text.trim() === '' ? rest : { ...rest, delay_seconds: Number(text) })
  }

  return (
    <div className='space-y-6'>
      <p className='text-sm text-muted-foreground'>
        Removes the Message from the inbox on its mail backend. The Message keeps its Categories and stays searchable —
        only the inbox membership changes.
      </p>
      <div className='space-y-2'>
        <Label htmlFor={delayId}>Delay (seconds, optional)</Label>
        <p className='text-xs text-muted-foreground'>
          Leave blank to archive during the Triage. With a delay, the Triage schedules the archive for that many seconds
          after the Message arrived — mail that is useful when it lands and worthless soon after leaves the inbox on its
          own. A whole number of seconds, at least 1. Re-triaging the Message replaces or cancels what is pending.
        </p>
        <Input
          id={delayId}
          className='max-w-40'
          inputMode='numeric'
          placeholder='3600'
          value={delayText}
          onChange={(e) => {
            setDelay(e.target.value)
          }}
        />
        {delayText.trim() !== '' && !isWholeSecondsAtLeastOne(delayText) ?
          <p className='text-xs [color:var(--warning)]'>The delay is a whole number of seconds, at least 1.</p>
        : null}
      </div>
      <ActionWhenField
        value={value.when}
        onChange={(when) => {
          onChange({ ...value, when })
        }}
      />
    </div>
  )
}

/** Whether the typed delay is what the shared schema will take (d-grcdd4ov). */
function isWholeSecondsAtLeastOne(text: string): boolean {
  const n = Number(text)
  return Number.isInteger(n) && n >= 1
}

/**
 * The optional "Only fire when…" gate shared by the Action editors (and, since
 * Taggers gained the same gate, the Tagger editors). A Switch toggles the
 * gate: off ⇒ `when` is `undefined` (omitted from the saved config, so the
 * Operator always fires); on ⇒ a `tag_key` input + a non-empty `equals` value
 * list. Enabling seeds an empty draft (`tag_key: ''`, one blank value) so the
 * per-type Zod schema rejects an enabled-but-incomplete gate on Save rather
 * than letting it slip through. Pre-population is implicit: an `undefined`
 * `value` renders the gate off; a present one renders it on with the fields
 * filled.
 */
export function ActionWhenField({
  value,
  onChange,
}: {
  value: ActionWhenDraft | undefined
  onChange: (next: ActionWhenDraft | undefined) => void
}) {
  const switchId = useId()
  const tagKeyId = useId()
  const enabled = value !== undefined
  return (
    <div className='space-y-3 rounded-md border border-border bg-muted/30 p-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='space-y-1'>
          <Label htmlFor={switchId}>{enabled ? 'Only when a Tag matches' : 'Always fires'}</Label>
          <p className='text-xs text-muted-foreground'>
            By default this Operator fires on every Message. Turn this on to gate it on a Tag value — it then fires only
            when the chosen Tag is one of the allowed values.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={(checked) => {
            onChange(checked ? { tag_key: '', equals: [''] } : undefined)
          }}
        />
      </div>
      {enabled ?
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor={tagKeyId}>Tag key</Label>
            <Input
              id={tagKeyId}
              className='max-w-[12rem] font-mono'
              placeholder='urgency'
              value={value.tag_key}
              onChange={(e) => {
                onChange({ ...value, tag_key: e.target.value })
              }}
            />
          </div>
          <div className='space-y-2'>
            <Label>Fires when the Tag is one of</Label>
            <p className='text-xs text-muted-foreground'>
              At least one value is required. The Action fires only when the Tag's value matches one of these.
            </p>
            <ValueEnumField
              idPrefix='when-equals'
              values={value.equals}
              onChange={(equals) => {
                onChange({ ...value, equals })
              }}
            />
          </div>
        </div>
      : null}
    </div>
  )
}

export interface DigestColumnDraft {
  header: string
  template: string
}

export interface DigestProseDraft {
  kind: 'text' | 'llm'
  text?: string
  prompt?: string
}

export interface DigestSectionDraft {
  category: string
  title: string
  render: 'list' | 'table' | 'count'
  item_template?: string
  columns?: DigestColumnDraft[]
  highlight?: { tag_key: string; over: string }
  before?: DigestProseDraft
  after?: DigestProseDraft
}

export interface DigestDeliveryDraft {
  schedule: string
  timezone?: string
  sections: DigestSectionDraft[]
  summary_model_id: string | null
}

/** Reshape a section draft for a newly picked render kind. */
function reshapeSection(section: DigestSectionDraft, render: DigestSectionDraft['render']): DigestSectionDraft {
  const { item_template: _item, columns: _cols, ...rest } = section
  if (render === 'list') {
    return { ...rest, render, item_template: '' }
  }
  if (render === 'table') {
    return { ...rest, render, columns: [{ header: '', template: '' }] }
  }
  return { ...rest, render }
}

export function DigestDeliveryEditor({
  value,
  onChange,
}: {
  value: DigestDeliveryDraft
  onChange: (next: DigestDeliveryDraft) => void
}) {
  const schedId = useId()
  const tzId = useId()
  const modelId = useId()

  const setSection = (i: number, next: DigestSectionDraft) => {
    onChange({
      ...value,
      sections: value.sections.map((sec, idx) => (idx === i ? next : sec)),
    })
  }
  const addSection = () => {
    onChange({
      ...value,
      sections: [...value.sections, { category: '', title: '', render: 'list', item_template: '' }],
    })
  }
  const removeSection = (i: number) => {
    onChange({
      ...value,
      sections: value.sections.filter((_, idx) => idx !== i),
    })
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={schedId}>Schedule (cron)</Label>
        <p className='text-xs text-muted-foreground'>
          A cron expression the daemon’s scheduler runs this edition on (e.g.{' '}
          <span className='font-mono'>0 20 * * *</span> for 8pm daily, <span className='font-mono'>0 8 * * 0</span> for
          Sunday mornings).
        </p>
        <Input
          id={schedId}
          className='max-w-[12rem] font-mono'
          placeholder='0 20 * * *'
          value={value.schedule}
          onChange={(e) => {
            onChange({ ...value, schedule: e.target.value })
          }}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={tzId}>Timezone (optional)</Label>
        <p className='text-xs text-muted-foreground'>
          IANA zone the schedule is evaluated in (e.g. <span className='font-mono'>America/New_York</span>). Leave blank
          to use the daemon host’s local time.
        </p>
        <Input
          id={tzId}
          className='max-w-[16rem] font-mono'
          placeholder='America/New_York'
          value={value.timezone ?? ''}
          onChange={(e) => {
            // Blank ⇒ the key is omitted from the saved config (host-local
            // time), matching the optional field in the shared schema. IANA
            // names never contain whitespace, so the value persists trimmed.
            const timezone = e.target.value.trim()
            const { timezone: _drop, ...rest } = value
            onChange(timezone.length > 0 ? { ...rest, timezone } : rest)
          }}
        />
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div>
            <Label>Sections</Label>
            <p className='text-xs text-muted-foreground'>
              Each section claims one <span className='font-mono'>digest_category</span> value and renders its Messages
              deterministically. Messages in categories with no section are counted in the digest footer.
            </p>
          </div>
          <Button type='button' variant='outline' size='sm' onClick={addSection}>
            Add section
          </Button>
        </div>
        {value.sections.map((section, i) => (
          <DigestSectionEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: sections have no domain id; rows reorder only via remove+add
            key={i}
            section={section}
            index={i}
            onChange={(next) => {
              setSection(i, next)
            }}
            onRemove={() => {
              removeSection(i)
            }}
          />
        ))}
      </div>

      <div className='space-y-2'>
        <Label htmlFor={modelId}>Summary model (for LLM prose blocks)</Label>
        <p className='text-xs text-muted-foreground'>
          Only used when a section declares an LLM intro/outro; the digest items themselves never involve a model.
        </p>
        <Select
          value={value.summary_model_id ?? 'none'}
          onValueChange={(v) => {
            onChange({ ...value, summary_model_id: v === 'none' ? null : v })
          }}
        >
          <SelectTrigger id={modelId} className='max-w-sm'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>None</SelectItem>
            <ModelOptionItems />
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function DigestSectionEditor({
  section,
  index,
  onChange,
  onRemove,
}: {
  section: DigestSectionDraft
  index: number
  onChange: (next: DigestSectionDraft) => void
  onRemove: () => void
}) {
  const baseId = useId()
  const setColumn = (i: number, patch: Partial<DigestColumnDraft>) => {
    const columns = (section.columns ?? []).map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    onChange({ ...section, columns })
  }
  return (
    <div className='space-y-3 rounded-md border border-border p-3'>
      <div className='flex items-end gap-2'>
        <div className='flex-1 space-y-1.5'>
          <Label htmlFor={`${baseId}-cat`}>Category</Label>
          <Input
            id={`${baseId}-cat`}
            className='font-mono'
            placeholder='bill'
            value={section.category}
            onChange={(e) => {
              onChange({ ...section, category: e.target.value })
            }}
          />
        </div>
        <div className='flex-1 space-y-1.5'>
          <Label htmlFor={`${baseId}-title`}>Title</Label>
          <Input
            id={`${baseId}-title`}
            placeholder='Bills & statements'
            value={section.title}
            onChange={(e) => {
              onChange({ ...section, title: e.target.value })
            }}
          />
        </div>
        <Button type='button' variant='ghost' size='icon' aria-label={`Remove section ${index + 1}`} onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor={`${baseId}-render`}>Render</Label>
        <Select
          value={section.render}
          onValueChange={(render) => {
            onChange(reshapeSection(section, render as DigestSectionDraft['render']))
          }}
        >
          <SelectTrigger id={`${baseId}-render`} className='max-w-[12rem]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='list'>List</SelectItem>
            <SelectItem value='table'>Table</SelectItem>
            <SelectItem value='count'>Count only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {section.render === 'list' ?
        <div className='space-y-1.5'>
          <Label htmlFor={`${baseId}-item`}>Item template</Label>
          <Input
            id={`${baseId}-item`}
            className='font-mono'
            placeholder='{{tag.payee}} — {{tag.amount}} due {{tag.due_date}}'
            value={section.item_template ?? ''}
            onChange={(e) => {
              onChange({ ...section, item_template: e.target.value })
            }}
          />
        </div>
      : null}

      {section.render === 'table' ?
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Label>Columns</Label>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                onChange({
                  ...section,
                  columns: [...(section.columns ?? []), { header: '', template: '' }],
                })
              }}
            >
              Add column
            </Button>
          </div>
          {(section.columns ?? []).map((column, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: columns have no domain id
              key={i}
              className='flex items-end gap-2'
            >
              <div className='w-40 space-y-1.5'>
                <Label htmlFor={`${baseId}-col-h-${i}`}>Header</Label>
                <Input
                  id={`${baseId}-col-h-${i}`}
                  placeholder='Amount'
                  value={column.header}
                  onChange={(e) => {
                    setColumn(i, { header: e.target.value })
                  }}
                />
              </div>
              <div className='flex-1 space-y-1.5'>
                <Label htmlFor={`${baseId}-col-t-${i}`}>Cell template</Label>
                <Input
                  id={`${baseId}-col-t-${i}`}
                  className='font-mono'
                  placeholder='{{tag.amount}}'
                  value={column.template}
                  onChange={(e) => {
                    setColumn(i, { template: e.target.value })
                  }}
                />
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={`Remove column ${i + 1}`}
                onClick={() => {
                  onChange({
                    ...section,
                    columns: (section.columns ?? []).filter((_, idx) => idx !== i),
                  })
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      : null}

      {section.render !== 'count' ?
        <div className='space-y-1.5'>
          <Label>Highlight (optional)</Label>
          <p className='text-xs text-muted-foreground'>
            Marks items whose extracted money/date Tag compares over a threshold (stored forms, e.g.{' '}
            <span className='font-mono'>10000:USD</span> or <span className='font-mono'>2026-08-10</span>). Leave both
            blank for none.
          </p>
          <div className='flex gap-2'>
            <Input
              aria-label={`Section ${index + 1} highlight tag key`}
              className='w-40 font-mono'
              placeholder='amount'
              value={section.highlight?.tag_key ?? ''}
              onChange={(e) => {
                const tag_key = e.target.value
                const over = section.highlight?.over ?? ''
                const { highlight: _h, ...rest } = section
                onChange(tag_key.trim() === '' && over.trim() === '' ? rest : { ...rest, highlight: { tag_key, over } })
              }}
            />
            <Input
              aria-label={`Section ${index + 1} highlight threshold`}
              className='w-40 font-mono'
              placeholder='10000:USD'
              value={section.highlight?.over ?? ''}
              onChange={(e) => {
                const over = e.target.value
                const tag_key = section.highlight?.tag_key ?? ''
                const { highlight: _h, ...rest } = section
                onChange(tag_key.trim() === '' && over.trim() === '' ? rest : { ...rest, highlight: { tag_key, over } })
              }}
            />
          </div>
        </div>
      : null}

      <DigestProseField
        label='Intro (before items)'
        value={section.before}
        onChange={(before) => {
          const { before: _b, ...rest } = section
          onChange(before === undefined ? rest : { ...rest, before })
        }}
      />
      <DigestProseField
        label='Outro (after items)'
        value={section.after}
        onChange={(after) => {
          const { after: _a, ...rest } = section
          onChange(after === undefined ? rest : { ...rest, after })
        }}
      />
    </div>
  )
}

/**
 * One optional prose block: None / static text / LLM summary. Text blocks
 * insert verbatim; LLM blocks use the edition’s summary model and are
 * omitted from the digest if the call fails.
 */
function DigestProseField({
  label,
  value,
  onChange,
}: {
  label: string
  value: DigestProseDraft | undefined
  onChange: (next: DigestProseDraft | undefined) => void
}) {
  const id = useId()
  const kind = value === undefined ? 'none' : value.kind
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex gap-2'>
        <Select
          value={kind}
          onValueChange={(next) => {
            if (next === 'none') {
              onChange(undefined)
            } else if (next === 'text') {
              onChange({ kind: 'text', text: '' })
            } else {
              onChange({ kind: 'llm', prompt: '' })
            }
          }}
        >
          <SelectTrigger id={id} className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>None</SelectItem>
            <SelectItem value='text'>Static text</SelectItem>
            <SelectItem value='llm'>LLM summary</SelectItem>
          </SelectContent>
        </Select>
        {value?.kind === 'text' ?
          <Input
            aria-label={`${label} text`}
            className='flex-1'
            placeholder='Pay on time.'
            value={value.text ?? ''}
            onChange={(e) => {
              onChange({ kind: 'text', text: e.target.value })
            }}
          />
        : null}
        {value?.kind === 'llm' ?
          <Input
            aria-label={`${label} prompt`}
            className='flex-1'
            placeholder='One-sentence overview of this section.'
            value={value.prompt ?? ''}
            onChange={(e) => {
              onChange({ kind: 'llm', prompt: e.target.value })
            }}
          />
        : null}
      </div>
    </div>
  )
}
