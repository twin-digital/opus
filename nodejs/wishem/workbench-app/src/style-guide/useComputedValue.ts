import { useLayoutEffect, useRef, useState } from 'react'

export type StyleProperty = 'backgroundColor' | 'color' | 'borderTopLeftRadius' | 'boxShadow' | 'fontSize'

/**
 * Reads a computed style value of the element, in the theme of its scope.
 * With `child` set, it reads the first child element of the referenced element.
 */
export const useComputedValue = (property: StyleProperty | undefined, child = false) => {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  useLayoutEffect(() => {
    const target = child ? ref.current?.firstElementChild : ref.current
    if (target && property) {
      setValue(getComputedStyle(target)[property])
    }
  }, [property, child])
  return { ref, value }
}
