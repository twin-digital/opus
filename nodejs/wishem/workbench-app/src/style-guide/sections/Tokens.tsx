import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { tokenGroups, type TokenGroup } from '../../tokens.js'
import { Section } from '../Section.js'

type StyleProperty = 'backgroundColor' | 'color' | 'borderTopLeftRadius' | 'boxShadow'

/** Formats a computed `rgb()` color as a hexadecimal value. Other values stay as they are. */
const toHex = (value: string) => {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)
  if (!match) {
    return value
  }
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

/** Reads a computed style value of the element, in the theme of its scope. */
const useComputedValue = (property: StyleProperty | undefined) => {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  useLayoutEffect(() => {
    if (ref.current && property) {
      setValue(getComputedStyle(ref.current)[property])
    }
  }, [property])
  return { ref, value }
}

const sampleStyle = (group: TokenGroup, name: string): CSSProperties => {
  switch (group.kind) {
    case 'fill':
      return { backgroundColor: `var(--${name})` }
    case 'text':
      return { color: `var(--${name})` }
    case 'radius':
      return { borderRadius: `var(--${name})` }
    case 'shadow':
      return { boxShadow: `var(--${name})` }
  }
}

const propertyOf = (kind: TokenGroup['kind']): StyleProperty | undefined => {
  switch (kind) {
    case 'fill':
      return 'backgroundColor'
    case 'text':
      return 'color'
    case 'radius':
      return 'borderTopLeftRadius'
    case 'shadow':
      return 'boxShadow'
  }
}

const Sample = ({ group, name }: { group: TokenGroup; name: string }) => {
  const { ref, value } = useComputedValue(propertyOf(group.kind))
  const text = group.kind === 'fill' || group.kind === 'text' ? toHex(value) : value
  const box =
    group.kind === 'text' ? 'grid place-items-center bg-ground font-body text-[15px] font-semibold'
    : group.kind === 'fill' ? ''
    : 'bg-surface'
  return (
    <div className='min-w-0'>
      <div
        ref={ref}
        data-token={name}
        style={sampleStyle(group, name)}
        className={`h-11 rounded-md border border-line ${box}`.trim()}
      >
        {group.kind === 'text' ? 'Aa' : null}
      </div>
      <div className='mt-1 font-mono text-[11px] break-words'>{name}</div>
      {text ?
        <div className='font-mono text-[11px] text-fg-muted break-words'>{text}</div>
      : null}
    </div>
  )
}

/** Swatches and samples. The values are read from the computed style, so `tokens.css` is the only source. */
export const Tokens = () => (
  <Section id='tokens' title='Tokens'>
    {tokenGroups.map((group) => (
      <div key={group.name} className='grid gap-2'>
        <h3 className='font-body text-ui font-semibold'>{group.name}</h3>
        <div className='grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5'>
          {group.tokens.map((name) => (
            <Sample key={name} group={group} name={name} />
          ))}
        </div>
      </div>
    ))}
  </Section>
)
