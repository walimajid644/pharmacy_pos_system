import { invoke } from '@tauri-apps/api/core';
import type { App } from 'vue';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import {
  diagnosticReason,
  diagnosticOperation,
  type DiagnosticOperation,
  type DiagnosticReason,
} from '@/lib/diagnosticContext';

type DiagnosticEvent = 'operation_failed' | 'frontend_unhandled' | 'promise_unhandled';
type DiagnosticSource =
  'app' | 'auth' | 'database' | 'pos' | 'catalog' | 'reports' | 'settings' | 'workspace';
type DiagnosticContext = {
  operation: DiagnosticOperation;
  reason: DiagnosticReason;
  supportId: string;
};
type Notice = { event: DiagnosticEvent; source: DiagnosticSource; context: DiagnosticContext };
const observers = new Set<(notice: Notice) => void>();

export function observeDiagnostics(observer: (notice: Notice) => void): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

/** Accepts only bounded codes; no raw errors, SQL, business identifiers or request payloads. */
export function reportDiagnostic(
  event: DiagnosticEvent,
  source: DiagnosticSource,
  details: Partial<Pick<DiagnosticContext, 'operation' | 'reason'>> = {},
): string {
  const context: DiagnosticContext = {
    operation: details.operation ?? 'general',
    reason: details.reason ?? 'unknown',
    supportId: `ERR-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
  };
  for (const observer of observers) {
    try {
      observer({ event, source, context });
    } catch {
      /* Diagnostics must not interrupt work. */
    }
  }
  if (!('__TAURI_INTERNALS__' in window)) return context.supportId;
  void invoke('record_diagnostic', { request: { event, source, context } }).catch(() => {
    // No recursive logging and no raw exception output.
    console.warn('Local diagnostic recording is unavailable');
  });
  return context.supportId;
}

function screenSource(): DiagnosticSource {
  const path = window.location.pathname;
  if (path === '/') return 'reports';
  if (path === '/pos') return 'pos';
  if (
    ['/products', '/categories', '/manufacturers', '/shelf-locations'].includes(path) ||
    path.startsWith('/catalog-')
  )
    return 'catalog';
  if (['/users', '/login', '/change-password'].includes(path)) return 'auth';
  if (path === '/settings') return 'settings';
  return 'workspace';
}

export function installErrorHandling(app: App): void {
  const toast = useToast();
  const { pick } = useI18n();
  let lastNotice = 0;
  const notify = (supportId: string) => {
    if (Date.now() - lastNotice < 5000) return;
    lastNotice = Date.now();
    const path = window.location.pathname;
    const message =
      path === '/pos'
        ? pick(
            'A screen could not complete its work. Reopen it. Check Sales History before retrying a sale.',
            'اسکرین کام مکمل نہیں کر سکی۔ دوبارہ کھولیں۔ فروخت دوبارہ کرنے سے پہلے فروخت کی تاریخ دیکھیں۔',
          )
        : path === '/'
          ? pick(
              'The dashboard could not complete its work. Try Refresh again.',
              'ڈیش بورڈ کام مکمل نہیں کر سکا۔ دوبارہ تازہ کریں۔',
            )
          : pick(
              'This screen could not complete its work. Reopen it and try again.',
              'اسکرین کام مکمل نہیں کر سکی۔ دوبارہ کھول کر کوشش کریں۔',
            );
    toast.error(`${message} ${pick('Support code', 'سپورٹ کوڈ')}: ${supportId}`, 8000);
  };
  app.config.errorHandler = (error, _instance, info) => {
    const supportId = reportDiagnostic('frontend_unhandled', screenSource(), {
      operation: diagnosticOperation(info),
      reason: diagnosticReason(error),
    });
    notify(supportId);
  };
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    const supportId = reportDiagnostic('promise_unhandled', screenSource(), {
      operation: 'async_task',
      reason: diagnosticReason(event.reason),
    });
    notify(supportId);
  });
  window.addEventListener('error', (event) => {
    event.preventDefault();
    const supportId = reportDiagnostic('frontend_unhandled', screenSource(), {
      operation: 'window_error',
      reason: diagnosticReason(event.error || event.message),
    });
    notify(supportId);
  });
}
