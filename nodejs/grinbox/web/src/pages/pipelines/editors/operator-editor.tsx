import { type OperatorTypeKey, operatorConfigSchemas } from '@twin-digital/grinbox-shared'
import { useState } from 'react'
import type { ZodError, ZodType } from 'zod'

import { Button } from '../../../components/ui/button.js'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.js'
import { Input } from '../../../components/ui/input.js'
import { Label } from '../../../components/ui/label.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs.js'
import { PipelineApiError } from '../../../lib/pipelines.js'
import { OPERATOR_TYPE_BY_KEY, blankConfigFor } from '../operator-types.js'
import {
  type ApplyCategoryDraft,
  ApplyCategoryEditor,
  type DigestDeliveryDraft,
  DigestDeliveryEditor,
  type NotifyDraft,
  NotifyEditor,
} from './action-editors.js'
import { type LlmDraft, LlmEditor } from './llm-editor.js'
import { type RuleBasedDraft, RuleBasedEditor, RuleBasedPreview } from './rule-based-editor.js'

/**
 * The Operator editor modal (ui-design.md §4). It owns the **atomic save flow**:
 * a draft `{ name, config }` held local until Save, with a sticky footer showing
 * `● Unsaved changes` (amber) + Cancel / Save. Per-type editors dispatch on
 * `typeKey` and mutate the draft config in place; on Save the draft is validated
 * client-side against `operatorConfigSchemas[typeKey]` (the same Zod schema the
 * server validates against) before the create/edit mutation fires. A
 * server-side `pipeline_validation_failed` / `invalid_config` rejection is
 * surfaced inline and keeps the editor open. Closing while dirty triggers a
 * confirm.
 *
 * Create vs. edit: `mode === 'create'` runs the create mutation; `mode === 'edit'`
 * the edit mutation. The form opens from a caller-supplied `initialConfig` draft:
 * the create path passes the type's blank config; the edit path passes the
 * Operator's stored config (the detail read API returns each Operator's parsed
 * config), so editing pre-populates the current settings.
 */

export type OperatorEditorMode = 'create' | 'edit'

export interface OperatorEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: OperatorEditorMode
  typeKey: OperatorTypeKey
  /**
   * The Pipeline this Operator belongs to. Threaded to the Rule-based Tagger
   * editor's live-preview pane (the preview evaluates the draft against this
   * Pipeline's recent Triages); other editor types ignore it.
   */
  pipelineId: number
  /** Initial operator name (empty for a fresh create). */
  initialName: string
  /** Initial draft config; defaults to the type's blank config. */
  initialConfig?: unknown
  /** Returns a list of error strings on validation failure (keeps editor open). */
  onSave: (input: { name: string; config: unknown }) => Promise<void>
}

export function OperatorEditor({
  open,
  onOpenChange,
  mode,
  typeKey,
  pipelineId,
  initialName,
  initialConfig,
  onSave,
}: OperatorEditorProps) {
  const label = OPERATOR_TYPE_BY_KEY[typeKey].label
  const [name, setName] = useState(initialName)
  // The draft config is `unknown` at the boundary; each per-type editor narrows.
  const [config, setConfig] = useState<unknown>(initialConfig ?? blankConfigFor(typeKey))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmClose, setConfirmClose] = useState(false)

  const dirty =
    name !== initialName || JSON.stringify(config) !== JSON.stringify(initialConfig ?? blankConfigFor(typeKey))

  const requestClose = () => {
    if (dirty && !confirmClose) {
      setConfirmClose(true)
      return
    }
    setConfirmClose(false)
    onOpenChange(false)
  }

  const handleSave = async () => {
    setErrors([])
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setErrors(['Name is required.'])
      return
    }
    // Client-side validation against the shared Zod schema — saves match what
    // the server will accept, and bad configs are caught before the round trip.
    const schemas: Record<OperatorTypeKey, ZodType> = operatorConfigSchemas
    const parsed = schemas[typeKey].safeParse(config)
    if (!parsed.success) {
      setErrors(zodMessages(parsed.error))
      return
    }
    setSaving(true)
    try {
      await onSave({ name: trimmedName, config: parsed.data })
      onOpenChange(false)
    } catch (err) {
      setErrors(serverErrorMessages(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          requestClose()
        }
      }}
    >
      <DialogContent className='max-w-4xl'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add' : 'Edit'} {label}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-6'>
          <div className='space-y-2'>
            <Label htmlFor='operator-name'>Operator name</Label>
            <Input
              id='operator-name'
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
              placeholder={label}
            />
          </div>

          <Tabs defaultValue='edit'>
            <TabsList>
              <TabsTrigger value='edit'>Edit</TabsTrigger>
              <TabsTrigger value='preview'>Preview</TabsTrigger>
            </TabsList>
            <TabsContent value='edit'>
              <TypeEditor typeKey={typeKey} config={config} onChange={setConfig} />
            </TabsContent>
            <TabsContent value='preview'>
              <TypePreview typeKey={typeKey} pipelineId={pipelineId} config={config} />
            </TabsContent>
          </Tabs>

          {errors.length > 0 ?
            <div
              role='alert'
              className='space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm [color:var(--danger)]'
            >
              <p className='font-medium'>Couldn't save this Operator</p>
              <ul className='list-inside list-disc space-y-0.5'>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          : null}
        </DialogBody>
        <DialogFooter>
          <div>
            {confirmClose ?
              <span className='text-sm [color:var(--warning)]'>Discard unsaved changes?</span>
            : dirty ?
              <span className='text-sm [color:var(--warning)]'>● Unsaved changes</span>
            : <span className='text-sm text-muted-foreground'>No unsaved changes</span>}
          </div>
          <div className='flex items-center gap-2'>
            {confirmClose ?
              <>
                <Button
                  variant='outline'
                  onClick={() => {
                    setConfirmClose(false)
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  variant='destructive'
                  onClick={() => {
                    setConfirmClose(false)
                    onOpenChange(false)
                  }}
                >
                  Discard
                </Button>
              </>
            : <>
                <Button variant='outline' onClick={requestClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void handleSave()
                  }}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            }
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Dispatch to the per-type edit form. The draft config flows through unchanged. */
function TypeEditor({
  typeKey,
  config,
  onChange,
}: {
  typeKey: OperatorTypeKey
  config: unknown
  onChange: (next: unknown) => void
}) {
  // The draft config is `unknown`; each per-type editor narrows it to its own
  // draft shape and the schema validates on save.
  switch (typeKey) {
    case 'llm_tagger':
      return <LlmEditor value={config as LlmDraft} onChange={onChange} />
    case 'rule_based_tagger':
      return <RuleBasedEditor value={config as RuleBasedDraft} onChange={onChange} />
    case 'notify':
      return <NotifyEditor value={config as NotifyDraft} onChange={onChange} />
    case 'apply_category':
      return <ApplyCategoryEditor value={config as ApplyCategoryDraft} onChange={onChange} />
    case 'digest_delivery':
      return <DigestDeliveryEditor value={config as DigestDeliveryDraft} onChange={onChange} />
  }
}

/**
 * The Preview tab content per Operator type. Only the Rule-based Tagger has a
 * live preview (its evaluation against the Pipeline's recent Triages); other
 * types show a placeholder until they grow their own preview.
 */
function TypePreview({
  typeKey,
  pipelineId,
  config,
}: {
  typeKey: OperatorTypeKey
  pipelineId: number
  config: unknown
}) {
  if (typeKey === 'rule_based_tagger') {
    return <RuleBasedPreview pipelineId={pipelineId} draft={config as RuleBasedDraft} />
  }
  return (
    <p className='rounded-md border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground'>
      No preview available for this Operator type yet.
    </p>
  )
}

/** Flatten a client-side ZodError into human messages with field paths. */
function zodMessages(err: ZodError): string[] {
  return err.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

/**
 * Turn a thrown mutation error into inline messages. A structured
 * `pipeline_validation_failed` (collision / cycle / dangling input) or
 * `invalid_config` carries a `details` array we expand into per-error lines;
 * anything else falls back to the top-level message.
 */
function serverErrorMessages(err: unknown): string[] {
  if (err instanceof PipelineApiError) {
    const detailLines = extractDetailLines(err.details)
    if (detailLines.length > 0) {
      return detailLines
    }
    return [err.message]
  }
  if (err instanceof Error) {
    return [err.message]
  }
  return ['Something went wrong.']
}

/** Pull human lines out of a `details` payload (validation errors / Zod issues). */
function extractDetailLines(details: unknown): string[] {
  if (!Array.isArray(details)) {
    return []
  }
  const lines: string[] = []
  for (const d of details) {
    if (typeof d === 'string') {
      lines.push(d)
    } else if (d && typeof d === 'object' && 'message' in d) {
      const m = (d as { message?: unknown }).message
      const path =
        'path' in d && Array.isArray((d as { path?: unknown }).path) ? (d as { path: unknown[] }).path.join('.') : ''
      if (typeof m === 'string') {
        lines.push(path ? `${path}: ${m}` : m)
      }
    }
  }
  return lines
}
