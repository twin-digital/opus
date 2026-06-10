import { Plus, X } from 'lucide-react'

import { Button } from '../../../components/ui/button.js'
import { Input } from '../../../components/ui/input.js'

/**
 * Editor for a Tag's output `value_enum` — the closed, duplicate-free,
 * non-empty set of values a Tagger may emit for its output key. Renders one
 * `Input` per value with add/remove controls. Values are kept as a plain string
 * array on the draft config; the per-type Zod schema enforces non-empty /
 * no-duplicates at save time.
 */
export function ValueEnumField({
  values,
  onChange,
  idPrefix,
}: {
  values: readonly string[]
  onChange: (next: string[]) => void
  idPrefix: string
}) {
  const setAt = (i: number, v: string) => {
    const next = [...values]
    next[i] = v
    onChange(next)
  }
  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i))
  }
  const add = () => {
    onChange([...values, ''])
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-2'>
        {values.map((v, i) => (
          <div key={`${idPrefix}-${i}`} className='flex items-center gap-1'>
            <Input
              aria-label={`Value ${i + 1}`}
              className='h-8 w-32 font-mono text-xs'
              value={v}
              onChange={(e) => {
                setAt(i, e.target.value)
              }}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              aria-label={`Remove value ${i + 1}`}
              onClick={() => {
                removeAt(i)
              }}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <Button type='button' variant='outline' size='sm' onClick={add}>
        <Plus />
        Add value
      </Button>
    </div>
  )
}
