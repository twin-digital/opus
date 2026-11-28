import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { FieldDefinition, FieldValue, Id } from '@thrashplay/wishem-core'

export type ChangeOutcome = { saved: true } | { saved: false; reason: string }

export interface ReferenceOption {
  id: Id
  /** For example `Color, Counter · e_99969ed3`. */
  text: string
}

export interface FieldRowProps {
  field: FieldDefinition
  value: FieldValue | undefined
  /** The options of a `reference` field. */
  options?: readonly ReferenceOption[]
  /** With no value, the control is disabled. */
  onChange?: (value: FieldValue) => Promise<ChangeOutcome>
  /** The first state, for the style guide and the tests. */
  initial?: { state: 'saving' | 'not-saved'; draft: string | boolean; reason?: string }
}

type Phase = 'idle' | 'saving' | 'not-saved'

const FAILED = 'The workbench failed to apply the change.'
const NOT_A_NUMBER = 'Type a number.'

const controlClass =
  'min-w-0 rounded-sm border border-control-border bg-surface px-2 py-1 text-control text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:text-fg-muted'

/** One field of a component: its label, its type, and the control that changes its value. */
export const FieldRow = ({ field, value, options = [], onChange, initial }: FieldRowProps) => {
  const id = useId()
  const [phase, setPhase] = useState<Phase>(initial?.state ?? 'idle')
  const [draft, setDraft] = useState<string | boolean | undefined>(initial?.draft)
  const [reason, setReason] = useState(initial?.reason ?? '')
  // The phase as a ref, so that a handler sees a change before the next render.
  const phaseRef = useRef<Phase>(phase)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const go = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const end = () => {
    setDraft(undefined)
    setReason('')
    go('idle')
  }

  const reject = (message: string) => {
    setReason(message)
    go('not-saved')
  }

  /** Sends the value, and shows the outcome. */
  const send = (next: FieldValue) => {
    if (!onChange) {
      return
    }
    setReason('')
    go('saving')
    const fail = (error: unknown) => {
      console.error(error)
      if (mounted.current) {
        reject(FAILED)
      }
    }
    let sent: Promise<ChangeOutcome>
    try {
      sent = onChange(next)
    } catch (error) {
      fail(error)
      return
    }
    void sent.then((outcome) => {
      if (!mounted.current) {
        return
      }
      if (outcome.saved) {
        end()
      } else {
        reject(outcome.reason)
      }
    }, fail)
  }

  const canCommit = () => phaseRef.current !== 'saving'

  const commitText = (text: string) => {
    if (!onChange || !canCommit()) {
      return
    }
    if (field.type === 'number') {
      if (value === undefined && text === '') {
        end()
        return
      }
      const number = Number(text)
      if (text.trim() === '' || !Number.isFinite(number)) {
        reject(NOT_A_NUMBER)
        return
      }
      if (number === value) {
        end()
        return
      }
      send(number)
      return
    }
    if (text === (value === undefined ? '' : String(value))) {
      end()
      return
    }
    send(text)
  }

  const commitChoice = (next: FieldValue) => {
    if (!canCommit()) {
      return
    }
    if (next === value) {
      end()
      return
    }
    setDraft(typeof next === 'boolean' ? next : String(next))
    send(next)
  }

  const saving = phase === 'saving'
  const busy = saving ? true : undefined
  const disabled = !onChange || saving
  const shownText =
    typeof draft === 'string' ? draft
    : value === undefined ? ''
    : String(value)

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (typeof draft === 'string') {
        commitText(draft)
      }
    } else if (event.key === 'Escape' && canCommit()) {
      event.preventDefault()
      end()
    }
  }

  const onBlur = () => {
    // Enter has ended the draft; a blur after it has nothing to commit.
    if (typeof draft === 'string' && phaseRef.current !== 'saving') {
      commitText(draft)
    }
  }

  let control
  if (field.type === 'boolean') {
    control = (
      <input
        id={id}
        type='checkbox'
        checked={typeof draft === 'boolean' ? draft : value === true}
        disabled={disabled}
        aria-busy={busy}
        onChange={(event) => {
          commitChoice(event.target.checked)
        }}
        className='size-4 accent-maker focus-visible:outline-2 focus-visible:outline-accent'
      />
    )
  } else if (field.type === 'reference') {
    const known =
      typeof draft === 'string' ? draft
      : typeof value === 'string' ? value
      : ''
    const selected = options.some((option) => option.id === known) ? known : ''
    control = (
      <select
        id={id}
        value={selected}
        disabled={disabled}
        aria-busy={busy}
        onChange={(event) => {
          commitChoice(event.target.value)
        }}
        className={`${controlClass} w-full`}
      >
        {selected === '' && (
          <option value='' disabled>
            No value
          </option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.text}
          </option>
        ))}
      </select>
    )
  } else {
    control = (
      <input
        id={id}
        type='text'
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        value={shownText}
        disabled={!onChange}
        readOnly={saving}
        aria-busy={busy}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={`${controlClass} w-full caret-maker`}
      />
    )
  }

  return (
    <div className='grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-4 py-2 md:grid-cols-[8rem_5rem_minmax(0,1fr)]'>
      <label htmlFor={id} className='min-w-0 text-ui break-words text-fg'>
        {field.label}
      </label>
      <span className='font-mono text-label font-medium text-fg-muted uppercase'>{field.type}</span>
      <div className='col-span-2 flex min-w-0 items-center gap-3 md:col-span-1'>
        {control}
        {saving && <span className='font-mono text-label font-medium text-fg-muted uppercase'>Saving</span>}
        {value === undefined && !saving && field.type !== 'reference' && (
          <span className='font-mono text-label font-medium whitespace-nowrap text-fg-muted uppercase'>no value</span>
        )}
      </div>
      {phase === 'not-saved' && (
        <p role='alert' className='col-span-2 text-ui text-danger-text md:col-span-1 md:col-start-3'>
          The value is not saved. {reason}
        </p>
      )}
    </div>
  )
}
