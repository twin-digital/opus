import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export type RenameOutcome = { saved: true } | { saved: false; reason: string }

type Phase = 'read' | 'edit' | 'saving' | 'not-saved'

export interface AppBarProps {
  /** The identity of the application. Drawn in lowercase. */
  title: string
  /** With no value, the title is a heading and not a control. */
  onRename?: (title: string) => Promise<RenameOutcome>
  /** The first state, for the style guide and the tests. */
  initial?: { state: 'edit' | 'saving' | 'not-saved'; draft: string; reason?: string }
}

const titleClass = 'min-w-0 truncate font-display text-xl font-extrabold tracking-[-0.02em]'

/** The bar at the top of the workbench. It shows the title, with a full stop in the maker color. */
export const AppBar = ({ title, onRename, initial }: AppBarProps) => {
  const [phase, setPhase] = useState<Phase>(initial?.state ?? 'read')
  const [draft, setDraft] = useState(initial?.draft ?? '')
  const [reason, setReason] = useState(initial?.reason ?? '')
  // The phase as a ref, so that a handler sees a change before the next render.
  const phaseRef = useRef<Phase>(phase)
  const mounted = useRef(true)
  const focusField = useRef(false)
  const focusButton = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const go = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (phase === 'read' && focusButton.current) {
      focusButton.current = false
      buttonRef.current?.focus()
    }
  }, [phase])

  const fieldRef = (input: HTMLInputElement | null) => {
    if (input && focusField.current) {
      focusField.current = false
      input.focus()
      input.select()
    }
  }

  const close = (refocus: boolean) => {
    focusButton.current = refocus
    go('read')
  }

  const open = () => {
    focusField.current = true
    setDraft(title)
    setReason('')
    go('edit')
  }

  const commit = (refocus: boolean) => {
    if (!onRename || (phaseRef.current !== 'edit' && phaseRef.current !== 'not-saved')) {
      return
    }
    if (draft.trim() === '' || draft === title) {
      close(refocus)
      return
    }
    setReason('')
    go('saving')
    void onRename(draft).then((outcome) => {
      if (!mounted.current) {
        return
      }
      if (outcome.saved) {
        close(true)
      } else {
        setReason(outcome.reason)
        go('not-saved')
      }
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      commit(true)
    } else if (event.key === 'Escape' && phaseRef.current !== 'saving') {
      event.preventDefault()
      close(true)
    }
  }

  const onBlur = () => {
    if (phaseRef.current === 'edit') {
      commit(false)
    }
  }

  if (!onRename || phase === 'read') {
    return (
      <header className='flex h-12 items-center border-b border-line bg-night px-4 text-on-night'>
        <h1 className={`${titleClass} lowercase`}>
          {onRename ?
            <button
              ref={buttonRef}
              type='button'
              title='Change the title'
              onClick={open}
              className='max-w-full cursor-text truncate rounded-sm align-bottom lowercase focus-visible:outline-2 focus-visible:outline-accent'
            >
              {title}
              <span aria-hidden='true' className='text-maker'>
                .
              </span>
            </button>
          : <>
              {title}
              <span aria-hidden='true' className='text-maker'>
                .
              </span>
            </>
          }
        </h1>
      </header>
    )
  }

  return (
    <>
      <header className='flex h-12 items-center gap-3 border-b border-line bg-night px-4 text-on-night'>
        <input
          ref={fieldRef}
          type='text'
          aria-label='Title'
          value={draft}
          readOnly={phase === 'saving'}
          aria-busy={phase === 'saving' ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={`${titleClass} h-9 flex-1 rounded-sm border border-control-border bg-night px-2 text-on-night caret-maker focus-visible:outline-2 focus-visible:outline-accent`}
        />
        {phase === 'saving' && <span className='font-mono text-label font-medium text-on-night uppercase'>Saving</span>}
      </header>
      {phase === 'not-saved' && (
        <p role='alert' className='bg-ground px-4 py-2 text-ui text-danger-text'>
          The title is not saved. {reason}
        </p>
      )}
    </>
  )
}
