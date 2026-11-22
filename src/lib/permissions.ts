/** Route access complements the live native permission checks. */
export function routePermissions(path: string): string[] {
  if (path === '/user-rights' || path === '/users') return ['users.manage'];
  if (path === '/login-history') return ['security.history'];
  if (path === '/restore') return ['backup.restore'];
  if (path === '/backup') return ['backup.export'];
  if (path === '/settings' || path === '/purchase-settings' || path === '/fbr-sandbox')
    return ['settings.manage'];
  if (path === '/pos') return ['sales.create'];
  if (path === '/sales-history') return ['sales.history'];
  if (path.startsWith('/sales-returns')) return ['sales.returns'];
  if (path === '/products' || path === '/item-search' || path === '/batch-stickers')
    return ['catalog.read'];
  if (
    [
      '/categories',
      '/manufacturers',
      '/shelf-locations',
      '/expense-heads',
      '/income-heads',
      '/bank-accounts',
    ].includes(path)
  )
    return ['registers.manage'];
  if (path.startsWith('/catalog-')) return ['catalog.import'];
  if (path === '/opening-balances') return ['opening.write'];
  if (path === '/bank-transactions') return ['banking.view'];
  if (path === '/incomes') return ['income.view'];
  if (path === '/payments' || path === '/expenses') return ['finance.view'];
  if (path === '/supplier-ledger' || path === '/purchase-suggestions') return ['purchases.read'];
  if (path === '/purchases') return ['purchases.receive'];
  if (path.startsWith('/purchase-orders'))
    return [
      path.endsWith('/receive')
        ? 'purchases.receive'
        : path === '/purchase-orders'
          ? 'purchases.read'
          : 'purchases.write',
    ];
  if (path.startsWith('/stock-adjustments')) return ['stock.adjust'];
  if (path === '/expiry-actions') return ['stock.quarantine'];
  if (path === '/customers' || path === '/customer-ledger') return ['customers.read'];
  if (path === '/suppliers') return ['purchases.read'];
  if (path === '/shifts') return ['shifts.open', 'shifts.close'];
  if (path === '/daily-closing') return ['reports.close'];
  if (
    path.startsWith('/reports') ||
    path === '/report-center' ||
    path === '/controlled-sales' ||
    path === '/cashier-performance'
  )
    return ['reports.view'];
  if (path === '/audit-log') return ['audit.view'];
  if (path === '/estimates' || path === '/preorders') return ['documents.write'];
  return [];
}
