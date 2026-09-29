import { createContext, useContext } from 'react'
import { lightTheme, type ThemeTokens } from './theme'

/** The active token set, supplied by App so no component holds a literal colour. */
export const ThemeContext = createContext<ThemeTokens>(lightTheme)

export const useTheme = () => useContext(ThemeContext)
