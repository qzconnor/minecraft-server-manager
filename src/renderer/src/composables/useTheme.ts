import { readonly, ref } from 'vue'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'msm-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

const theme = ref<Theme>(getInitialTheme())
applyTheme(theme.value)

export function useTheme() {
  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    localStorage.setItem(STORAGE_KEY, theme.value)
  }

  function set(value: Theme): void {
    theme.value = value
    applyTheme(theme.value)
    localStorage.setItem(STORAGE_KEY, theme.value)
  }

  return { theme: readonly(theme), toggle, set }
}
