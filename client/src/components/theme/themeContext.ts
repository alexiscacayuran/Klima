import { createContext } from 'react'

export type Theme = 'light' | 'dark'

/**
 * Dark first: the forecast surfaces read far better on the dark basemap, and
 * the theme decides the basemap (see THEME_BASEMAP in map/config/styles).
 */
export const DEFAULT_THEME: Theme = 'dark'

/**
 * Where the choice is kept between visits. index.html reads the same key in an
 * inline script before first paint, so the two have to change together.
 */
export const THEME_STORAGE_KEY = 'klima-theme'

export type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

/**
 * App-wide rather than one of the MapSettings, because what it switches is the
 * `.dark` class on <html>, which every surface reads — not only the map's.
 */
export const ThemeContext = createContext<ThemeState>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
})
