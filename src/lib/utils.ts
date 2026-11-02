import { useI18n } from './i18n'
import { localDateKey } from './businessDay'

export function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}

export function formatCurrency(amount: number): string {
  return useI18n().formatCurrency(amount)
}

export function formatDate(date: string | Date): string {
  return useI18n().formatDate(date)
}

export function formatDateTime(date: string | Date): string {
  return useI18n().formatDateTime(date)
}

export function isNearExpiry(expiryDate: string, daysThreshold = 60): boolean {
  const today = localDateKey()
  const expiry = expiryDate.slice(0, 10)
  const diffDays = (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return Number.isFinite(diffDays) && diffDays >= 0 && diffDays <= daysThreshold
}

export function isExpired(expiryDate: string): boolean {
  return expiryDate.slice(0, 10) < localDateKey()
}

export function generateUUID(): string {
  return crypto.randomUUID()
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

