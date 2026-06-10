import { Plus, X } from 'lucide-react'
import { useId, useRef } from 'react'

import { Button } from '../../../components/ui/button.js'
import { Input } from '../../../components/ui/input.js'
import { Label } from '../../../components/ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js'
import { Textarea } from '../../../components/ui/textarea.js'
import { MODEL_OPTIONS } from '../operator-types.js'
import { ValueEnumField } from './value-enum-field.js'

/**
 * LLM Tagger editor (ui-design.md §4). A large prompt-template textarea, a
 * model picker, and the multi-output `outputs` list — each entry is a
 * `{ tag_key, value_enum }` produced together by a single model call. Edits are
 * local to the draft config; validation against `llmTaggerConfigSchema`
 * (including the duplicate-output-key check) runs on Save in the parent panel.
 */

export interface LlmOutputDraft {
  tag_key: string
  value_enum: string[]
}

export interface LlmDraft {
  model_id: string
  prompt_template: string
  outputs: LlmOutputDraft[]
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
              <Label>Values</Label>
              <ValueEnumField
                idPrefix={`llm-out-${i}`}
                values={output.value_enum}
                onChange={(value_enum) => {
                  setOutput(i, { value_enum })
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
