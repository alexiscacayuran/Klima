import { useContext } from 'react'
import { ThemeContext } from './themeContext'
import type { ThemeState } from './themeContext'

/** Read/write access to the light/dark choice. */
export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}
