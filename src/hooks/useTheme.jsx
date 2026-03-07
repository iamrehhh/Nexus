import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

// 6 named themes
export const THEMES = {
  'dark-rose': { label: 'Dark Rose', icon: '🌹', preview: '#c084d4' },
  'midnight-blue': { label: 'Midnight Blue', icon: '🌙', preview: '#60a5fa' },
  'forest': { label: 'Forest', icon: '🌿', preview: '#34d399' },
  'soft-light': { label: 'Soft Light', icon: '☁️', preview: '#e9d5ff' },
  'sunset': { label: 'Sunset', icon: '🌅', preview: '#fb923c' },
  'minimal': { label: 'Minimal', icon: '◻️', preview: '#888' }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('nexus_theme') || 'dark-rose')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nexus_theme', theme)
  }, [theme])

  const setTheme = (t) => setThemeState(t)
  // Legacy toggle for backward compat
  const toggle = () => setThemeState(t => t.startsWith('dark') || t === 'midnight-blue' || t === 'forest' || t === 'minimal' ? 'soft-light' : 'dark-rose')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
