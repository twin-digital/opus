import { Plus, X } from 'lucide-react'
import { useId, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type ActionWhenDraft, ActionWhenField } from './action-editors'
import { ModelOptionItems } from './model-options'
import { ValueEnumField } from './value-enum-field'

/**
 * LLM Tagger editor (ui-design.md §4). A large prompt-template textarea, a
 * model picker, the multi-output `outputs` list, and the optional `when`
 * firing gate. Each output is produced by the same single model call and is
 * one of two kinds:
 *  - **Enum** — `{ tag_key, value_enum }`: the model answers with exactly one
 *    of the listed values.
 *  - **Extracted** — `{ tag_key, value_type }`: the model pulls a free value
 *    (string / money / date) out of the Message; the server normalizes it, and
 *    a value that fails normalization drops the Tag.
 * Edits are local to the draft config; validation against
 * `llmTaggerConfigSchema` (including the duplicate-output-key check) runs on
 * Save in the parent panel.
 */

export interface LlmOutputDraft {
  tag_key: string
  value_enum?: string[]
  value_type?: 'string' | 'money' | 'date'
}

export interface LlmDraft {
  model_id: string
  prompt_template: string
  outputs: LlmOutputDraft[]
  when?: ActionWhenDraft
}

/** The per-output kind options in the picker. */
const OUTPUT_KINDS: readonly { value: string; label: string }[] = [
  { value: 'enum', label: 'Enum (one of listed values)' },
  { value: 'string', label: 'Extracted text' },
  { value: 'money', label: 'Extracted amount (money)' },
  { value: 'date', label: 'Extracted date' },
]

/** The draft's kind for the picker: 'enum' or the extracted value type. */
function outputKind(output: LlmOutputDraft): string {
  return output.value_type ?? 'enum'
}

/** Reshape an output draft for a newly picked kind, keeping its tag_key. */
function reshapeOutput(output: LlmOutputDraft, kind: string): LlmOutputDraft {
  if (kind === 'enum') {
    return { tag_key: output.tag_key, value_enum: output.value_enum ?? [''] }
  }
  return {
    tag_key: output.tag_key,
    value_type: kind as 'string' | 'money' | 'date',
  }
}

export function LlmEditor({ value, onChange }: { value: LlmDraft; onChange: (next: LlmDraft) => void }) {
  const promptId = useId()
  const modelId = useId()

  // Stable keys for output rows (no domain id), kept in sync with the list so a
  // tag_key edit doesn't remount the row and steal focus.
  const idCounter = useRef(0)
  const rowIds = useRef<string[]>(value.outputs.map(() => `out-${idCounter.current++}`))
  while (rowIds.current.length < value.outputs.length) {
    rowIds.current.push(`out-${idCounter.current++}`)
  }
  while (rowIds.current.length > value.outputs.length) {
    rowIds.current.pop()
  }

  const setOutput = (i: number, patch: Partial<LlmOutputDraft>) => {
    const outputs = value.outputs.map((o, idx) => (idx === i ? { ...o, ...patch } : o))
    onChange({ ...value, outputs })
  }
  const replaceOutput = (i: number, next: LlmOutputDraft) => {
    const outputs = value.outputs.map((o, idx) => (idx === i ? next : o))
    onChange({ ...value, outputs })
  }
  const addOutput = () => {
    rowIds.current.push(`out-${idCounter.current++}`)
    onChange({
      ...value,
      outputs: [...value.outputs, { tag_key: '', value_enum: [''] }],
    })
  }
  const removeOutput = (i: number) => {
    rowIds.current.splice(i, 1)
    onChange({ ...value, outputs: value.outputs.filter((_, idx) => idx !== i) })
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor={modelId}>Model</Label>
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
            <ModelOptionItems />
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={promptId}>Prompt template</Label>
        <p className='text-xs text-muted-foreground'>
          The system prompt the model classifies against. Message fields are interpolated in at run time.
        </p>
        <Textarea
          id={promptId}
          className='min-h-40 font-mono text-xs'
          placeholder='Classify this email…'
          value={value.prompt_template}
          onChange={(e) => {
            onChange({ ...value, prompt_template: e.target.value })
          }}
        />
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div>
            <Label>Outputs</Label>
            <p className='text-xs text-muted-foreground'>One model call produces all of these Tags together.</p>
          </div>
          <Button type='button' variant='outline' size='sm' onClick={addOutput}>
            <Plus />
            Add output
          </Button>
        </div>

        {value.outputs.map((output, i) => (
          <div key={rowIds.current[i] ?? `out-${i}`} className='space-y-3 rounded-md border border-border p-3'>
            <div className='flex items-end gap-2'>
              <div className='flex-1 space-y-1.5'>
                <Label htmlFor={`${promptId}-out-${i}`}>Tag key</Label>
                <Input
                  id={`${promptId}-out-${i}`}
                  className='font-mono'
                  placeholder='category'
                  value={output.tag_key}
                  onChange={(e) => {
                    setOutput(i, { tag_key: e.target.value })
                  }}
                />
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={`Remove output ${i + 1}`}
                onClick={() => {
                  removeOutput(i)
                }}
              >
                <X />
              </Button>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${promptId}-kind-${i}`}>Output kind</Label>
              <Select
                value={outputKind(output)}
                onValueChange={(kind) => {
                  replaceOutput(i, reshapeOutput(output, kind))
                }}
              >
                <SelectTrigger id={`${promptId}-kind-${i}`} className='max-w-[16rem]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {output.value_type === undefined ?
              <div className='space-y-1.5'>
                <Label>Values</Label>
                <ValueEnumField
                  idPrefix={`llm-out-${i}`}
                  values={output.value_enum ?? ['']}
                  onChange={(value_enum) => {
                    setOutput(i, { value_enum })
                  }}
                />
              </div>
            : <p className='text-xs text-muted-foreground'>
                The model extracts this value from the Message; the server normalizes it{' '}
                {output.value_type === 'money' ?
                  '(integer minor units + currency, e.g. 19503:USD)'
                : output.value_type === 'date' ?
                  '(ISO date, e.g. 2026-08-10)'
                : '(trimmed, length-capped)'}{' '}
                and drops it if it can’t. Extracted Tags can’t back firing gates.
              </p>
            }
          </div>
        ))}
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
