import { useEffect, useState } from 'react'

/** True while the media query matches, e.g. `useMediaQuery('(min-width: 1024px)')` for the desktop layout. */
export function useMediaQuery(query: string) {
  const supported = typeof window.matchMedia === 'function'
  const [matches, setMatches] = useState(() => supported && window.matchMedia(query).matches)
  useEffect(() => {
    if (!supported) return
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query, supported])
  return matches
}

export const DESKTOP = '(min-width: 1024px)'
