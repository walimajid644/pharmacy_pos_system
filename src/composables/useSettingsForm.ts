import { reportDiagnostic } from '@/lib/diagnostics';
import { errorMessage } from '@/lib/errors';
import { ref, onMounted } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { generateUUID } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import type { AppSettings } from '@/lib/types';

export function useSettingsForm() {
  const toast = useToast();

  const settingsStore = useSettingsStore();

  const { theme, setTheme } = useTheme();

  const {
    language,
    setLanguage,
    numberFormat,
    setNumberFormat,
    dateFormat,
    setDateFormat,
    formatDate,
    formatCurrency,
    pick,
  } = useI18n();

  const loading = ref(false);

  const activeTab = ref<'company' | 'tax' | 'inventory' | 'receipt' | 'appearance'>('company');

  // Form state
  const formData = ref({
    id: '',
    company_name: '',
    company_address: '',
    company_phone: '',
    tax_rate: 0,
    currency_symbol: 'Rs',
    low_stock_threshold: 10,
    near_expiry_days: 60,
    receipt_header: '',
    receipt_footer: '',
    receipt_logo_path: '',
    show_drap: true,
  });

  onMounted(async () => {
    await loadSettings();
  });

  async function loadSettings() {
    loading.value = true;
    try {
      const settings = await executeQuery<AppSettings>('SELECT * FROM app_settings LIMIT 1');

      if (settings.length > 0) {
        const s = settings[0];
        formData.value = {
          id: s.id,
          company_name: s.company_name || '',
          company_address: s.company_address || '',
          company_phone: s.company_phone || '',
          tax_rate: s.tax_rate ?? 0,
          currency_symbol: s.currency_symbol || 'Rs',
          low_stock_threshold: s.low_stock_threshold ?? 10,
          near_expiry_days: s.near_expiry_days ?? 60,
          receipt_header: s.receipt_header || '',
          receipt_footer: s.receipt_footer || '',
          receipt_logo_path: s.receipt_logo_path ?? '',
          show_drap: s.show_drap !== 0,
        };
      }
    } catch {
      reportDiagnostic('operation_failed', 'settings');
    } finally {
      loading.value = false;
    }
  }

  async function saveSettings() {
    if (!formData.value.company_name) {
      toast.warning('Company name is required');
      return;
    }

    if (formData.value.tax_rate < 0 || formData.value.tax_rate > 100) {
      toast.error('Tax rate must be between 0 and 100');
      return;
    }
    if (
      !Number.isInteger(formData.value.near_expiry_days) ||
      formData.value.near_expiry_days < 1 ||
      formData.value.near_expiry_days > 3650
    ) {
      toast.error('Near-expiry warning must be between 1 and 3650 days');
      return;
    }

    loading.value = true;
    try {
      const now = new Date().toISOString();

      if (formData.value.id) {
        // Update existing settings
        await executeUpdate(
          `UPDATE app_settings SET 
            company_name = ?, company_address = ?, company_phone = ?,
            tax_rate = ?, currency_symbol = ?,
            low_stock_threshold = ?, near_expiry_days = ?,
            receipt_header = ?, receipt_footer = ?, receipt_logo_path = ?, show_drap = ?,
            updated_at = ?
           WHERE id = ?`,
          [
            formData.value.company_name,
            formData.value.company_address,
            formData.value.company_phone,
            formData.value.tax_rate,
            formData.value.currency_symbol,
            formData.value.low_stock_threshold,
            formData.value.near_expiry_days,
            formData.value.receipt_header,
            formData.value.receipt_footer,
            formData.value.receipt_logo_path || null,
            formData.value.show_drap ? 1 : 0,
            now,
            formData.value.id,
          ],
        );
      } else {
        // Create new settings
        const id = generateUUID();
        await executeUpdate(
          `INSERT INTO app_settings (
            id, company_name, company_address, company_phone,
            tax_rate, currency_symbol,
            low_stock_threshold, near_expiry_days,
            receipt_header, receipt_footer, receipt_logo_path, show_drap,
            theme, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            formData.value.company_name,
            formData.value.company_address,
            formData.value.company_phone,
            formData.value.tax_rate,
            formData.value.currency_symbol,
            formData.value.low_stock_threshold,
            formData.value.near_expiry_days,
            formData.value.receipt_header,
            formData.value.receipt_footer,
            formData.value.receipt_logo_path || null,
            formData.value.show_drap ? 1 : 0,
            'light',
            now,
            now,
          ],
        );
        formData.value.id = id;
      }

      // Reload settings in store
      await settingsStore.loadSettings();

      toast.success('Settings saved successfully');
    } catch (error: unknown) {
      reportDiagnostic('operation_failed', 'settings');
      toast.error('Failed to save settings: ' + errorMessage(error));
    } finally {
      loading.value = false;
    }
  }

  return {
    theme,
    setTheme,
    language,
    setLanguage,
    numberFormat,
    setNumberFormat,
    dateFormat,
    setDateFormat,
    formatDate,
    formatCurrency,
    pick,
    loading,
    activeTab,
    formData,
    saveSettings,
  };
}
