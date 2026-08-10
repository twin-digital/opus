import { SelectItem } from '@/components/ui/select'
import { useModelOptions } from '@/lib/models'

/**
 * The `SelectItem`s for a `GET /api/models`-backed model picker (LLM Tagger
 * `model_id`, Digest `summary_model_id`): the fetched options, or a single
 * disabled status row while the fetch is pending / after it failed — never a
 * silently empty dropdown.
 */
export function ModelOptionItems() {
  const { data, isPending, isError } = useModelOptions()
  if (isPending) {
    return (
      <SelectItem value='__pending' disabled>
        Loading models…
      </SelectItem>
    )
  }
  if (isError) {
    return (
      <SelectItem value='__error' disabled>
        Couldn’t load models
      </SelectItem>
    )
  }
  return (
    <>
      {data.map((m) => (
        <SelectItem key={m.id} value={m.id}>
          {m.label}
        </SelectItem>
      ))}
    </>
  )
}
