import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings } from '@/lib/types'
import { executeQuery, executeUpdate } from '@/lib/database'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings | null>(null)

  async function loadSettings() {
    try {
      const results = await executeQuery<AppSettings>('SELECT * FROM app_settings LIMIT 1')
      if (results.length > 0) {
        settings.value = results[0]
      } else {
        // Create default settings
        await executeUpdate(
          `INSERT INTO app_settings (id, company_name, tax_rate, currency_symbol, theme, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            'Pharmacy POS',
            0,
            'Rs',
            'light',
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        )
        await loadSettings()
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  async function updateSettings(updates: Partial<AppSettings>) {
    if (!settings.value) return

    const fields: string[] = []
    const values: any[] = []

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(settings.value.id)

    await executeUpdate(
      `UPDATE app_settings SET ${fields.join(', ')} WHERE id = ?`,
      values
    )

    await loadSettings()
  }

  return {
    settings,
    loadSettings,
    updateSettings,
  }
})
