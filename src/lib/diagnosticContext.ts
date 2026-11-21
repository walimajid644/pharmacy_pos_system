export type DiagnosticOperation =
  | 'general'
  | 'product_load'
  | 'product_save'
  | 'register_load'
  | 'register_save'
  | 'dashboard_refresh'
  | 'frontend_render'
  | 'frontend_event'
  | 'frontend_watch'
  | 'async_task'
  | 'window_error';
export type DiagnosticReason =
  | 'unknown'
  | 'constraint_violation'
  | 'database_unavailable'
  | 'schema_mismatch'
  | 'permission_denied'
  | 'session_expired'
  | 'type_error'
  | 'reference_error'
  | 'range_error'
  | 'module_load'
  | 'resize_observer'
  | 'network';

/** Classify locally; raw exception text, SQL and business data never enter the log. */
export function diagnosticReason(error: unknown): DiagnosticReason {
  let message = '';
  let name = '';
  try {
    if (typeof error === 'string') message = error.slice(0, 2048);
    else if (error && typeof error === 'object') {
      const value = error as { message?: unknown; name?: unknown };
      if (typeof value.message === 'string') message = value.message.slice(0, 2048);
      if (typeof value.name === 'string') name = value.name;
    }
  } catch {
    return 'unknown';
  }
  if (/ResizeObserver loop/i.test(message)) return 'resize_observer';
  if (/session.*(expired|unavailable)|not authenticated|sign in|log in/i.test(message))
    return 'session_expired';
  if (/not permitted|permission denied|not authorized|forbidden/i.test(message))
    return 'permission_denied';
  if (/constraint failed|constraint violation/i.test(message)) return 'constraint_violation';
  if (/no such (table|column)|has no column/i.test(message)) return 'schema_mismatch';
  if (
    /database is (locked|busy)|unable to open database|database.*(unavailable|malformed)/i.test(
      message,
    )
  )
    return 'database_unavailable';
  if (/dynamically imported module|loading chunk|importing a module script/i.test(message))
    return 'module_load';
  if (/failed to fetch|networkerror|network error/i.test(message)) return 'network';
  if (name === 'TypeError') return 'type_error';
  if (name === 'ReferenceError') return 'reference_error';
  if (name === 'RangeError') return 'range_error';
  return 'unknown';
}

export function diagnosticOperation(info: string): DiagnosticOperation {
  if (info.includes('event handler')) return 'frontend_event';
  if (info.includes('watcher')) return 'frontend_watch';
  return 'frontend_render';
}
