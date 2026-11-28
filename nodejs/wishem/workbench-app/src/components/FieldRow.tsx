import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from './Button.js'
import type { FieldDefinition, FieldValue, Id } from '@thrashplay/wishem-core'

export type ChangeOutcome = { saved: true } | { saved: false; reason: string }

export interface ReferenceOption {
  id: Id
  /** For example `Counter, Color · e_99969ed3`. */
  text: string
}

/** A change of a `reference-list` field. */
export interface ListChange {
  operation: 'add-reference' | 'remove-reference'
  reference: Id
}

export interface FieldRowProps {
  field: FieldDefinition
  value: FieldValue | undefined
  /** The options of a `reference` field, and the entities that a `reference-list` field can name. */
  options?: readonly ReferenceOption[]
  /** With no value, the control is disabled. */
  onChange?: (value: FieldValue) => Promise<ChangeOutcome>
  /** The changes of a `reference-list` field. With no value, the list control is disabled. */
  onListChange?: (change: ListChange) => Promise<ChangeOutcome>
  /** With no value, the button Clear is disabled. */
  onClear?: () => Promise<ChangeOutcome>
  /** The first state, for the style guide and the tests. */
  initial?: { state: 'saving' | 'not-saved' | 'not-cleared'; draft?: string | boolean; reason?: string }
}

type Phase = 'idle' | 'saving' | 'not-saved'
type Act = 'save' | 'clear'
/** Where the focus goes after an accepted change of the list. */
type FocusPlan =
  { kind: 'remove'; id: Id; index: number; accepted: boolean } | { kind: 'add'; id: Id; accepted: boolean }

const FAILED = 'The workbench failed to apply the change.'
const NOT_A_NUMBER = 'Type a number.'

const controlClass =
  'min-w-0 rounded-sm border border-control-border bg-surface px-2 py-1 text-control text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:text-fg-muted'

/** The name and the short ID of an option text such as `Card · e_2a3b4c5d`. */
const splitText = (text: string) => {
  const cut = text.lastIndexOf(' · ')
  return cut < 0 ? { name: text, short: '' } : { name: text.slice(0, cut), short: text.slice(cut + 3) }
}

/** One field of a component: its label, its type, and the control that changes its value. */
export const FieldRow = ({ field, value, options = [], onChange, onListChange, onClear, initial }: FieldRowProps) => {
  const id = useId()
  const [phase, setPhase] = useState<Phase>(
    initial?.state === 'not-cleared' ? 'not-saved'
    : initial?.state === 'not-saved' || initial?.state === 'saving' ? initial.state
    : 'idle',
  )
  const [draft, setDraft] = useState<string | boolean | undefined>(initial?.draft)
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [failed, setFailed] = useState<Act>(initial?.state === 'not-cleared' ? 'clear' : 'save')
  // The phase as a ref, so that a handler sees a change before the next render.
  const phaseRef = useRef<Phase>(phase)
  const mounted = useRef(true)
  const [pick, setPick] = useState('')
  const group = useRef<HTMLDivElement>(null)
  const addSelect = useRef<HTMLSelectElement>(null)
  const plan = useRef<FocusPlan>(undefined)

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

  const reject = (message: string, act: Act) => {
    setReason(message)
    setFailed(act)
    go('not-saved')
  }

  /** Calls the change or the clear, and shows the outcome. */
  const run = (act: Act, call: () => Promise<ChangeOutcome>) => {
    setReason('')
    go('saving')
    const fail = (error: unknown) => {
      console.error(error)
      if (mounted.current) {
        reject(FAILED, act)
      }
    }
    let sent: Promise<ChangeOutcome>
    try {
      sent = call()
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
        reject(outcome.reason, act)
      }
    }, fail)
  }

  const send = (next: FieldValue) => {
    if (onChange) {
      run('save', () => onChange(next))
    }
  }

  const clear = () => {
    if (onClear && canCommit()) {
      run('clear', onClear)
    }
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
        reject(NOT_A_NUMBER, 'save')
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
  const items = Array.isArray(value) ? (value as readonly Id[]) : []
  const available = options.filter((option) => !items.includes(option.id))
  const picked = available.some((option) => option.id === pick) ? pick : (available[0]?.id ?? '')

  const changeList = (change: ListChange, next: FocusPlan) => {
    if (!onListChange || !canCommit()) {
      return
    }
    plan.current = next
    run('save', () =>
      onListChange(change).then(
        (outcome) => {
          if (outcome.saved && plan.current === next) {
            next.accepted = true
          } else {
            plan.current = undefined
          }
          return outcome
        },
        (error: unknown) => {
          plan.current = undefined
          throw error
        },
      ),
    )
  }

  // After an accepted change that the part shows, the focus follows the rules of the list.
  useLayoutEffect(() => {
    const current = plan.current
    if (!current?.accepted || phaseRef.current === 'saving') {
      return
    }
    const removes = Array.from(group.current?.querySelectorAll<HTMLElement>('[data-item] button') ?? [])
    if (current.kind === 'remove') {
      if (items.includes(current.id)) {
        return
      }
      plan.current = undefined
      const target =
        (removes[Math.min(current.index, removes.length - 1)] as HTMLElement | undefined) ?? addSelect.current
      target?.focus()
    } else {
      if (!items.includes(current.id)) {
        return
      }
      plan.current = undefined
      if (available.length === 0) {
        removes.at(-1)?.focus()
      }
    }
  })
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
  } else if (field.type === 'reference-list') {
    const listDisabled = !onListChange || saving
    control = (
      <div
        ref={group}
        role='group'
        aria-labelledby={`${id}-label`}
        aria-busy={busy}
        className='flex min-w-0 flex-1 flex-col gap-2'
      >
        {value === undefined && (
          <span className='font-mono text-label font-medium whitespace-nowrap text-fg-muted uppercase'>no value</span>
        )}
        {value !== undefined && items.length === 0 && (
          <span className='font-mono text-label font-medium whitespace-nowrap text-fg-muted uppercase'>empty list</span>
        )}
        {items.length > 0 && (
          <ul className='grid gap-1'>
            {items.map((item, index) => {
              const option = options.find((candidate) => candidate.id === item)
              const { name, short } = splitText(option?.text ?? item)
              return (
                <li key={item} data-item className='flex items-center justify-between gap-3'>
                  <span className='flex min-w-0 items-baseline gap-2'>
                    <span className='min-w-0 text-ui break-words text-fg'>{name}</span>
                    {short !== '' && (
                      <span className='font-mono text-label font-medium text-fg-muted uppercase'>{short}</span>
                    )}
                  </span>
                  <span className='shrink-0'>
                    <Button
                      label='Remove'
                      accessibleName={`Remove ${option?.text ?? item}`}
                      disabled={listDisabled}
                      onPress={() => {
                        changeList(
                          { operation: 'remove-reference', reference: item },
                          { kind: 'remove', id: item, index, accepted: false },
                        )
                      }}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <div className='flex min-w-0 items-center justify-between gap-3'>
          <select
            id={id}
            ref={addSelect}
            aria-label={`Add to ${field.label}`}
            value={picked}
            disabled={listDisabled || available.length === 0}
            onChange={(event) => {
              setPick(event.target.value)
            }}
            className={`${controlClass} min-w-0 flex-1`}
          >
            {available.map((option) => (
              <option key={option.id} value={option.id}>
                {option.text}
              </option>
            ))}
          </select>
          <span className='shrink-0'>
            <Button
              label='Add'
              disabled={listDisabled || available.length === 0}
              onPress={() => {
                if (picked !== '') {
                  changeList(
                    { operation: 'add-reference', reference: picked },
                    { kind: 'add', id: picked, accepted: false },
                  )
                }
              }}
            />
          </span>
        </div>
      </div>
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

  // The layout follows the width of this container (@lg: 512 px), not the viewport.
  return (
    <div className='@container'>
      <div className='grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-4 py-2 @lg:grid-cols-[8rem_5rem_minmax(0,1fr)]'>
        <label
          id={`${id}-label`}
          htmlFor={field.type === 'reference-list' ? undefined : id}
          className='min-w-0 text-ui break-words text-fg'
        >
          {field.label}
        </label>
        <span className='font-mono text-label font-medium text-fg-muted uppercase'>{field.type}</span>
        <div
          className={`col-span-2 flex min-w-0 gap-3 @lg:col-span-1 ${field.type === 'reference-list' ? 'items-start' : 'items-center'}`}
        >
          {control}
          <span className='shrink-0'>
            <Button
              label='Clear'
              accessibleName={`Clear ${field.label}`}
              disabled={!onClear || saving || value === undefined}
              onPress={clear}
            />
          </span>
          {saving && <span className='font-mono text-label font-medium text-fg-muted uppercase'>Saving</span>}
          {value === undefined && !saving && field.type !== 'reference' && field.type !== 'reference-list' && (
            <span className='font-mono text-label font-medium whitespace-nowrap text-fg-muted uppercase'>no value</span>
          )}
        </div>
        {phase === 'not-saved' && (
          <p role='alert' className='col-span-2 text-ui text-danger-text @lg:col-span-1 @lg:col-start-3'>
            The value is not {failed === 'clear' ? 'cleared' : 'saved'}. {reason}
          </p>
        )}
      </div>
    </div>
  )
}
