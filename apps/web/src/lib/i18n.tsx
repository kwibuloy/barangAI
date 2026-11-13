import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { filipino } from './locales/fil'

type Language = 'en' | 'fil'
const LanguageContext = createContext<{ language: Language; setLanguage: (value: Language) => void }>({
  language: 'en',
  setLanguage: () => {},
})

// The strings live in one file per language; this module only picks between them.
export { filipino }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setValue] = useState<Language>(() =>
    localStorage.getItem('barangai-language') === 'fil' ? 'fil' : 'en',
  )
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  function setLanguage(value: Language) {
    localStorage.setItem('barangai-language', value)
    document.documentElement.lang = value
    setValue(value)
  }
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
export function useText() {
  const { language } = useLanguage()
  return (text: string) =>
    language === 'fil'
      ? (filipino[text] ??
        (text.startsWith('Request failed (') ? `Hindi natuloy ang kahilingan ${text.slice(15)}. Subukan muli.` : text))
      : text
}
export function Txt({ children }: { children: string }) {
  const t = useText()
  return <>{t(children)}</>
}
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage()
  const t = useText()
  return (
    <button
      className={`inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium transition-colors ${className}`}
      type="button"
      aria-label={t(language === 'en' ? 'Filipino interface' : 'English interface')}
      onClick={() => setLanguage(language === 'en' ? 'fil' : 'en')}
    >
      {language === 'en' ? 'Filipino' : 'English'}
    </button>
  )
}
