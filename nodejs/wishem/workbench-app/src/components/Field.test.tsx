import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Field, useFieldControl } from './Field.js'

interface ProbeProps {
  id?: string
  invalid?: boolean
  'aria-describedby'?: string
}

/** A control that takes its attributes from the field. */
const Probe = (props: ProbeProps) => {
  const control = useFieldControl(props)
  return (
    <input
      id={control.id}
      aria-describedby={control['aria-describedby']}
      aria-invalid={control['aria-invalid']}
      data-testid='probe'
    />
  )
}

describe('Field', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const draw = (node: React.ReactNode) => {
    act(() => {
      root.render(node)
    })
  }

  const probe = () => container.querySelector<HTMLInputElement>('[data-testid="probe"]')

  it('names the control with the label', () => {
    draw(
      <Field label='Speed'>
        <Probe />
      </Field>,
    )
    const label = container.querySelector('label')
    expect(label?.textContent).toBe('Speed')
    expect(probe()?.id).toBeTruthy()
    expect(label?.htmlFor).toBe(probe()?.id)
    expect(probe()?.labels?.[0]).toBe(label)
  })

  it('passes a click on the label to the control, which the web browser focuses', () => {
    draw(
      <Field label='Speed'>
        <Probe />
      </Field>,
    )
    const clicks: Element[] = []
    probe()?.addEventListener('click', (event) => clicks.push(event.target as Element))
    act(() => {
      container.querySelector('label')?.click()
    })
    expect(clicks).toEqual([probe()])
  })

  it('describes the control with the error message and sets aria-invalid', () => {
    draw(
      <Field label='Speed' error='Enter a number.'>
        <Probe />
      </Field>,
    )
    const message = container.querySelector('p')
    expect(message?.textContent).toBe('Enter a number.')
    expect(probe()?.getAttribute('aria-describedby')).toBe(message?.id)
    expect(probe()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('sets no description and no error state with no error message', () => {
    draw(
      <Field label='Speed'>
        <Probe />
      </Field>,
    )
    expect(container.querySelector('p')).toBeNull()
    expect(probe()?.hasAttribute('aria-describedby')).toBe(false)
    expect(probe()?.hasAttribute('aria-invalid')).toBe(false)
  })

  it('uses the id of the caller in the place of the id of the field', () => {
    draw(
      <Field label='Speed'>
        <Probe id='mine' />
      </Field>,
    )
    expect(probe()?.id).toBe('mine')
    expect(container.querySelector('label')?.htmlFor).not.toBe('mine')
  })

  it('keeps the description of the caller before the error message', () => {
    draw(
      <Field label='Speed' error='Enter a number.'>
        <Probe aria-describedby='hint' />
      </Field>,
    )
    const message = container.querySelector('p')
    expect(probe()?.getAttribute('aria-describedby')).toBe(`hint ${message?.id}`)
  })

  it('gives the error state for the invalid prop of a control in a field with no error message', () => {
    draw(
      <Field label='Speed'>
        <Probe invalid />
      </Field>,
    )
    expect(probe()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('gives each field its own id', () => {
    draw(
      <>
        <Field label='A'>
          <Probe />
        </Field>
        <Field label='B'>
          <Probe />
        </Field>
      </>,
    )
    const ids = Array.from(container.querySelectorAll('input')).map((input) => input.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('useFieldControl with no field', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('uses its own id and invalid', () => {
    act(() => {
      root.render(<Probe id='own' invalid />)
    })
    const input = container.querySelector('input')
    expect(input?.id).toBe('own')
    expect(input?.getAttribute('aria-invalid')).toBe('true')
    expect(input?.hasAttribute('aria-describedby')).toBe(false)
  })

  it('sets nothing when the control has no id and is valid', () => {
    act(() => {
      root.render(<Probe />)
    })
    const input = container.querySelector('input')
    expect(input?.hasAttribute('id')).toBe(false)
    expect(input?.hasAttribute('aria-invalid')).toBe(false)
  })
})
