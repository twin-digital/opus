import type { Id, Model } from '@thrashplay/wishem-core'
import { sendInput, type InputPort, type PortReader } from '@thrashplay/wishem-renderer-react'
import { useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { ProductPanel } from '../components/ProductPanel.js'
import { outcomeText } from '../outcome-text.js'
import { usePart } from './use-part.js'

/** The input type of the store `product`. */
export const PRODUCT_SET_FIELD = 'product/set-field'

export interface ProductToolProps {
  port: PortReader
  /** With no value, each control is disabled. */
  input: InputPort | undefined
}

/** Draws nothing when the port reads no part `product`. */
export const ProductTool = ({ port, input }: ProductToolProps): ReactNode => {
  const model = usePart(port, 'product') as Model | undefined
  const [selected, setSelected] = useState<Id>()
  const wrapper = useRef<HTMLDivElement>(null)
  const focusInInspector = useRef(false)

  const exists = model?.entities.some((entity) => entity.id === selected) ?? false
  if (selected !== undefined && !exists) {
    setSelected(undefined)
  }

  // After the removal of the selected entity, the focus goes to the list.
  useLayoutEffect(() => {
    if (selected === undefined && focusInInspector.current) {
      focusInInspector.current = false
      wrapper.current?.querySelector('nav')?.focus()
    }
  }, [selected])

  if (!model) {
    return null
  }

  const track = (event: FocusEvent<HTMLDivElement>, entering: boolean) => {
    const target = event.target as HTMLElement
    if (entering) {
      focusInInspector.current = !target.closest('nav')
    } else if (target.isConnected && !event.relatedTarget) {
      focusInInspector.current = false
    }
  }

  return (
    <div
      ref={wrapper}
      onFocus={(event) => {
        track(event, true)
      }}
      onBlur={(event) => {
        track(event, false)
      }}
    >
      <ProductPanel
        model={model}
        selected={exists ? selected : undefined}
        onSelect={setSelected}
        onChange={
          input &&
          (async (change) => {
            const outcome = await sendInput(input, { type: PRODUCT_SET_FIELD, payload: change })
            return outcome.ok ? { saved: true } : { saved: false, reason: outcomeText(outcome, 'the value') }
          })
        }
      />
    </div>
  )
}
