import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'barangai-theme'
const ThemeContext = createContext<{ theme: ThemeChoice; dark: boolean; setTheme: (value: ThemeChoice) => void }>({
  theme: 'system',
  dark: false,
  setTheme: () => {},
})

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

const systemDark = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** Follows the device by default; residents and staff can pin light or dark in their account menu. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setChoice] = useState<ThemeChoice>(stored)
  const [deviceDark, setDeviceDark] = useState(systemDark)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDeviceDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && deviceDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0e0d' : '#f5f4f1')
  }, [dark])
  function setTheme(value: ThemeChoice) {
    try {
      localStorage.setItem(KEY, value)
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    setChoice(value)
  }
  return <ThemeContext.Provider value={{ theme, dark, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
