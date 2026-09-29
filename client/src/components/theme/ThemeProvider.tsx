import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_THEME, THEME_STORAGE_KEY, ThemeContext } from './themeContext'
import type { Theme } from './themeContext'

/**
 * The stored choice, or the default. Storage can be missing or throw (private
 * windows, blocked site data), and either way the app opens dark.
 */
const readStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Owns the light/dark choice and writes it onto <html>.
 *
 * The class is what the Tailwind `dark:` variant and the `.dark` token block in
 * index.css key on. `color-scheme` goes with it so native parts — scrollbars,
 * the search field's own chrome — follow the same theme instead of the OS.
 *
 * The first paint is not this component's: index.html applies the stored theme
 * before React loads, so a light-mode reload does not flash dark. This effect
 * then re-applies the same value, and takes over from there.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Not persisted, but still applied for this visit.
    }
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
