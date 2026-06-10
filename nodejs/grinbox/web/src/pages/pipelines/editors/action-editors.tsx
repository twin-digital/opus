import { useId } from 'react'

import { Input } from '../../../components/ui/input.js'
import { Label } from '../../../components/ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js'
import { Switch } from '../../../components/ui/switch.js'
import { Textarea } from '../../../components/ui/textarea.js'
import { useCredentials } from '../../../lib/pipelines.js'
import { MODEL_OPTIONS } from '../operator-types.js'
import { ValueEnumField } from './value-enum-field.js'

/**
 * Editors for the Action Operator types (ui-design.md §4: "simpler config form
 * per Action type"). Each owns a draft config slice the parent panel validates
 * against the matching `operatorConfigSchemas` entry on Save.
 *
 *  - Notify: message template + Pushover Credential picker.
 *  - Apply Category: category-name template.
 *  - Digest delivery: cron schedule + model + prompt template.
 */

/**
 * The optional firing gate an Action draft carries (mirrors `actionWhenSchema`
 * in `@twin-digital/grinbox-shared`). Absent on the draft ⇒ no `when` key in the saved config
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
  when?: ActionWhenDraft
}

export function NotifyEditor({ value, onChange }: { value: NotifyDraft; onChange: (next: NotifyDraft) => void }) {
  const msgId = useId()
  const credId = useId()
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
          The Grinbox-owned Category (label) to apply. May be templated from Message fields.
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

/**
 * The optional "Only fire when…" gate shared by the Action editors. A Switch
 * toggles the gate: off ⇒ `when` is `undefined` (omitted from the saved config,
 * so the Action always fires); on ⇒ a `tag_key` input + a non-empty `equals`
 * value list. Enabling seeds an empty draft (`tag_key: ''`, one blank value) so
 * the per-type Zod schema rejects an enabled-but-incomplete gate on Save rather
 * than letting it slip through. Pre-population is implicit: an `undefined`
 * `value` renders the gate off; a present one renders it on with the fields
 * filled.
 */
function ActionWhenField({
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
            By default this Action fires on every Message. Turn this on to gate it on a Tag value — it then fires only
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

export interface DigestDeliveryDraft {
  schedule: string
  model_id: string
  prompt_template: string
}

export function DigestDeliveryEditor({
  value,
  onChange,
}: {
  value: DigestDeliveryDraft
  onChange: (next: DigestDeliveryDraft) => void
}) {
  const schedId = useId()
  const modelId = useId()
  const promptId = useId()
  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={schedId}>Schedule (cron)</Label>
        <p className='text-xs text-muted-foreground'>
          A cron expression the daemon's scheduler runs the digest on (e.g. <span className='font-mono'>0 8 * * *</span>{' '}
          for 8am daily).
        </p>
        <Input
          id={schedId}
          className='max-w-[12rem] font-mono'
          placeholder='0 8 * * *'
          value={value.schedule}
          onChange={(e) => {
            onChange({ ...value, schedule: e.target.value })
          }}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={modelId}>Summarization model</Label>
        <Select
          value={value.model_id || undefined}
          onValueChange={(model_id) => {
            onChange({ ...value, model_id })
          }}
        >
          <SelectTrigger id={modelId} className='max-w-sm'>
            <SelectValue placeholder='Select a model' />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={promptId}>Prompt template</Label>
        <Textarea
          id={promptId}
          className='min-h-32 font-mono text-xs'
          placeholder='Summarize today’s qualifying mail…'
          value={value.prompt_template}
          onChange={(e) => {
            onChange({ ...value, prompt_template: e.target.value })
          }}
        />
      </div>
    </div>
  )
}
