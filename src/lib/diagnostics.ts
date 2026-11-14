import { invoke } from '@tauri-apps/api/core';
import type { App } from 'vue';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';

type DiagnosticEvent = 'operation_failed' | 'frontend_unhandled' | 'promise_unhandled';
type DiagnosticSource =
  'app' | 'auth' | 'database' | 'pos' | 'catalog' | 'reports' | 'settings' | 'workspace';
type Notice = { event: DiagnosticEvent; source: DiagnosticSource };
const observers = new Set<(notice: Notice) => void>();

export function observeDiagnostics(observer: (notice: Notice) => void): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

/** Deliberately accepts no Error, message, SQL, identifiers or request payload. */
export function reportDiagnostic(event: DiagnosticEvent, source: DiagnosticSource): void {
  for (const observer of observers) observer({ event, source });
  if (!('__TAURI_INTERNALS__' in window)) return;
  void invoke('record_diagnostic', { request: { event, source } }).catch(() => {
    // No recursive logging and no raw exception output.
    console.warn('Local diagnostic recording is unavailable');
  });
}

export function installErrorHandling(app: App): void {
  const toast = useToast();
  const { pick } = useI18n();
  let lastNotice = 0;
  const notify = () => {
    if (Date.now() - lastNotice < 5000) return;
    lastNotice = Date.now();
    toast.error(
      pick(
        'A screen could not complete its work. Reopen it. Check Sales History before retrying a sale.',
        'اسکرین کام مکمل نہیں کر سکی۔ دوبارہ کھولیں۔ فروخت دوبارہ کرنے سے پہلے فروخت کی تاریخ دیکھیں۔',
      ),
      8000,
    );
  };
  app.config.errorHandler = () => {
    reportDiagnostic('frontend_unhandled', 'app');
    notify();
  };
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    reportDiagnostic('promise_unhandled', 'app');
    notify();
  });
  window.addEventListener('error', (event) => {
    event.preventDefault();
    reportDiagnostic('frontend_unhandled', 'app');
    notify();
  });
}
