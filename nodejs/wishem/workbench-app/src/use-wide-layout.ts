import { useEffect, useState } from 'react'

const QUERY = '(min-width: 1200px)'

const read = (): boolean => typeof matchMedia === 'function' && matchMedia(QUERY).matches

/** True while the page is at least 1200 px wide. Follows changes of the width. */
export const useWideLayout = (): boolean => {
  const [wide, setWide] = useState(read)

  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      return
    }
    const query = matchMedia(QUERY)
    const update = () => {
      setWide(query.matches)
    }
    update()
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
    }
  }, [])

  return wide
}
