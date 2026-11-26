import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Button } from './Button.js'

export interface PromptBoxProps {
  /**
   * The name for a screen reader.
   */
  label: string
  onSend: (text: string) => void
  onStop: () => void
  /**
   * The text of a new box. Read one time.
   */
  defaultValue?: string
  /**
   * Locks the box and shows `Stop`. The box empties at the end of the work only when it sent for this work and did not stop.
   */
  working?: boolean
  disabled?: boolean
  /**
   * Shown in the hint line of a disabled box, for example "Not connected".
   */
  disabledReason?: string
  placeholder?: string
  /**
   * Default: 3.
   */
  minLines?: number
  /**
   * Default: 8.
   */
  maxLines?: number
}

const SEND_LABEL = 'Make a wish'
const STOP_LABEL = 'Stop'
const WORKING_TEXT = 'Wishem is working'
const HINT = 'Enter to send · Shift+Enter for a new line'

type Mark = 'none' | 'sent' | 'stopped'

const boxClass = 'grid gap-2 rounded-md border bg-ground px-3 pt-2.5 pb-2'

const idleBorder =
  'border-control-border st-focus-within:border-maker-text st-focus-within:shadow-[inset_0_0_0_1px_var(--maker-text)]'

const areaClass = [
  'block w-full resize-none border-0 bg-transparent p-0 font-mono text-ui leading-[1.55] text-maker-text caret-maker outline-0 outline-transparent',
  '[field-sizing:content] max-h-[calc(var(--max-lines)*1lh)] min-h-[calc(var(--min-lines)*1lh)]',
  'placeholder:text-fg-muted read-only:text-fg-muted disabled:opacity-50',
].join(' ')

/**
 * A multi-line prompt with a hint line and one action. It holds its text. Enter sends, and Shift+Enter makes a new line.
 *
 * While `working` is true, the text is locked and `Stop` is the action. At the end of the work, the box empties only
 * when it sent for this work and did not stop.
 */
export const PromptBox = ({
  label,
  onSend,
  onStop,
  defaultValue = '',
  working = false,
  disabled = false,
  disabledReason,
  placeholder,
  minLines = 3,
  maxLines = 8,
}: PromptBoxProps) => {
  const [text, setText] = useState(defaultValue)
  const [mark, setMark] = useState<Mark>('none')
  const [wasWorking, setWasWorking] = useState(working)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const previousWorking = useRef(working)

  if (wasWorking !== working) {
    setWasWorking(working)
    if (wasWorking) {
      if (mark === 'sent') {
        setText('')
      }
      setMark('none')
    }
  }

  // The button that has focus stays in place, so a change of `working` moves focus only between the text and the button.
  useLayoutEffect(() => {
    if (previousWorking.current === working) {
      return
    }
    previousWorking.current = working
    const active = document.activeElement
    if (working && active === areaRef.current) {
      buttonRef.current?.focus()
    } else if (!working && active === buttonRef.current) {
      areaRef.current?.focus()
    }
  }, [working])

  const locked = working && !disabled
  const canSend = !disabled && !working && text.trim() !== ''

  const send = () => {
    setMark('sent')
    onSend(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // keyCode 229 marks a key of an input method
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const composing = event.nativeEvent.isComposing || event.keyCode === 229
    if (event.key !== 'Enter' || event.shiftKey || composing) {
      return
    }
    event.preventDefault()
    if (canSend) {
      send()
    }
  }

  const style = { '--min-lines': minLines, '--max-lines': maxLines } as CSSProperties

  return (
    <div
      role='group'
      aria-label={label}
      style={style}
      className={`${boxClass} ${locked ? 'border-spirit' : idleBorder}`}
    >
      <textarea
        ref={areaRef}
        aria-label={label}
        value={text}
        placeholder={placeholder}
        readOnly={locked}
        tabIndex={locked ? -1 : undefined}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value)
          if (!working) {
            setMark('none')
          }
        }}
        onKeyDown={onKeyDown}
        className={areaClass}
      />
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
        {locked ?
          <span className='inline-flex items-center text-small text-spirit-text'>
            <span
              aria-hidden='true'
              className='mr-1.5 inline-block size-[11px] animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none'
            />
            {WORKING_TEXT}
          </span>
        : <span className='text-small text-fg-muted'>{disabled && disabledReason ? disabledReason : HINT}</span>}
        <span className='ml-auto'>
          {locked ?
            <Button
              ref={buttonRef}
              onClick={() => {
                setMark('stopped')
                onStop()
              }}
            >
              {STOP_LABEL}
            </Button>
          : <Button ref={buttonRef} variant='maker' disabled={!canSend} onClick={send}>
              {SEND_LABEL}
            </Button>
          }
        </span>
      </div>
    </div>
  )
}
