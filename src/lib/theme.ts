import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'pharmacy-pos-theme'

// Initialize theme from localStorage or default to light
const currentTheme = ref<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'light')

// Apply theme to document
function applyTheme(theme: Theme) {
  const resolvedTheme = theme === 'auto' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  
  document.documentElement.setAttribute('data-theme', resolvedTheme)
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
}

// Watch for theme changes
watch(currentTheme, (newTheme) => {
  localStorage.setItem(STORAGE_KEY, newTheme)
  applyTheme(newTheme)
}, { immediate: true })

// Listen for system theme changes when in auto mode
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme.value === 'auto') {
      applyTheme('auto')
    }
  })
}

export function useTheme() {
  const setTheme = (theme: Theme) => {
    currentTheme.value = theme
  }

  const toggleTheme = () => {
    currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light'
  }

  const isDark = () => {
    if (currentTheme.value === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return currentTheme.value === 'dark'
  }

  return {
    theme: currentTheme,
    setTheme,
    toggleTheme,
    isDark
  }
}
