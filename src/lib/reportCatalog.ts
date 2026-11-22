export type ReportCell = string | number | null;
export type ReportRecord = Record<string, ReportCell>;
export interface ReportDefinition {
  id: string;
  title: string;
  permission: string;
  dated: boolean;
  note: string;
  columns: { key: string; label: string; money?: boolean }[];
  query: string;
}
const column = (key: string, label: string, money = false) => ({ key, label, money });
export const reportCatalog: ReportDefinition[] = [
  {
    id: 'stock-list',
    title: 'Items Stock',
    permission: 'catalog.read',
    dated: false,
    note: 'Current physical batch stock includes expired and quarantined units. It is not a sellable-stock figure.',
    columns: [
      column('sku', 'Code'),
      column('name', 'Item'),
      column('pack_size', 'Pack'),
      column('stock', 'Physical stock'),
      column('unit_price', 'Sale price', true),
    ],
    query: `SELECT p.sku,p.name,p.pack_size,p.unit_price,COALESCE(SUM(b.quantity_in_stock),0) AS stock FROM products p LEFT JOIN product_batches b ON b.product_id=p.id WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name,p.sku`,
  },
  {
    id: 'companies',
    title: 'Companies / Manufacturers',
    permission: 'catalog.read',
    dated: false,
    note: 'Current registered companies, including inactive records. Archived records are excluded.',
    columns: [
      column('name', 'Company'),
      column('description', 'Description'),
      column('state', 'Status'),
    ],
    query: `SELECT name,description,CASE WHEN is_active=1 THEN 'Active' ELSE 'Inactive' END AS state FROM manufacturers WHERE deleted_at IS NULL ORDER BY name`,
  },
  {
    id: 'customers',
    title: 'Customer List',
    permission: 'customers.read',
    dated: false,
    note: 'Current customer balances, including opening balances and subsequent ledger activity. Date filters do not apply.',
    columns: [
      column('customer_code', 'Code'),
      column('name', 'Customer'),
      column('phone_number', 'Phone'),
      column('current_balance', 'Current balance', true),
    ],
    query: `SELECT customer_code,trim(first_name||' '||last_name) AS name,phone_number,current_balance FROM customers WHERE deleted_at IS NULL ORDER BY name,customer_code`,
  },
  {
    id: 'suppliers',
    title: 'Supplier List',
    permission: 'purchases.read',
    dated: false,
    note: 'Current supplier contacts. Use Supplier Ledger for outstanding purchase liabilities and payments.',
    columns: [
      column('supplier_code', 'Code'),
      column('name', 'Supplier'),
      column('contact_person', 'Contact'),
      column('phone_number', 'Phone'),
    ],
    query: `SELECT supplier_code,name,contact_person,phone_number FROM suppliers WHERE deleted_at IS NULL ORDER BY name,supplier_code`,
  },
  ...(['expense', 'income'] as const).map((kind) => ({
    id: `${kind}-heads`,
    title: kind === 'expense' ? 'Expense Heads' : 'Income Heads',
    permission: 'registers.manage',
    dated: false,
    note: 'Current registered heads, including inactive records. Archived records are excluded.',
    columns: [
      column('name', 'Head'),
      column('description', 'Description'),
      column('state', 'Status'),
    ],
    query: `SELECT name,description,CASE WHEN is_active=1 THEN 'Active' ELSE 'Inactive' END AS state FROM ${kind}_heads WHERE deleted_at IS NULL ORDER BY name`,
  })),
  {
    id: 'banks',
    title: 'Bank Account List',
    permission: 'banking.view',
    dated: false,
    note: 'Current bank-account register. Use Bank Balances for dated book balances.',
    columns: [
      column('name', 'Bank account'),
      column('description', 'Description'),
      column('state', 'Status'),
    ],
    query: `SELECT name,description,CASE WHEN is_active=1 THEN 'Active' ELSE 'Inactive' END AS state FROM bank_accounts WHERE deleted_at IS NULL ORDER BY name`,
  },
  {
    id: 'bank-balances',
    title: 'Bank Balances',
    permission: 'banking.view',
    dated: true,
    note: 'Opening = all posted entries before From. Closing = opening plus period movement. Unassigned legacy bank entries are excluded; assign them in Bank Transactions.',
    columns: [
      column('name', 'Account'),
      column('opening', 'Opening', true),
      column('movement', 'Period movement', true),
      column('closing', 'Closing', true),
    ],
    query: `SELECT a.name,COALESCE(SUM(CASE WHEN l.entry_date<? THEN l.amount_cents ELSE 0 END),0)/100.0 AS opening,COALESCE(SUM(CASE WHEN l.entry_date>=? AND l.entry_date<=? THEN l.amount_cents ELSE 0 END),0)/100.0 AS movement,COALESCE(SUM(CASE WHEN l.entry_date<=? THEN l.amount_cents ELSE 0 END),0)/100.0 AS closing FROM bank_accounts a LEFT JOIN bank_ledger l ON l.account_id=a.id GROUP BY a.id ORDER BY a.name`,
  },
  {
    id: 'purchases',
    title: 'Purchase Order Summary',
    permission: 'purchases.read',
    dated: true,
    note: 'Filtered by order date. Order totals are commitments, not payments or received-stock value. Received units are cumulative through today. Cancelled orders are excluded.',
    columns: [
      column('po_number', 'Order'),
      column('order_date', 'Order date'),
      column('supplier', 'Supplier'),
      column('status', 'Status'),
      column('received', 'Received units'),
      column('total_amount', 'Order total', true),
    ],
    query: `SELECT po.po_number,po.order_date,s.name AS supplier,po.status,COALESCE((SELECT SUM(quantity_received) FROM purchase_order_items WHERE po_id=po.id),0) AS received,po.total_amount FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.order_date>=? AND po.order_date<=? AND po.status<>'cancelled' ORDER BY po.order_date,po.po_number`,
  },
  {
    id: 'expenses',
    title: 'Expenses by Head',
    permission: 'finance.view',
    dated: true,
    note: 'Posted expense vouchers by entry date. Voided vouchers are excluded.',
    columns: [
      column('head', 'Expense head'),
      column('vouchers', 'Vouchers'),
      column('amount', 'Total expenses', true),
    ],
    query: `SELECT category AS head,COUNT(*) AS vouchers,SUM(amount_cents)/100.0 AS amount FROM account_entries WHERE kind='expense' AND status='posted' AND entry_date>=? AND entry_date<=? GROUP BY category ORDER BY amount DESC,head`,
  },
  {
    id: 'income',
    title: 'Non-sales Income by Head',
    permission: 'income.view',
    dated: true,
    note: 'Posted non-sales income by entry date. Sales, customer debt collections and bank transfers are excluded.',
    columns: [
      column('head', 'Income head'),
      column('vouchers', 'Vouchers'),
      column('amount', 'Total income', true),
    ],
    query: `SELECT head_name AS head,COUNT(*) AS vouchers,SUM(amount_cents)/100.0 AS amount FROM income_entries WHERE status='posted' AND entry_date>=? AND entry_date<=? GROUP BY head_name ORDER BY amount DESC,head`,
  },
  {
    id: 'sales-trend',
    title: 'Monthly Sales Trend',
    permission: 'sales.history',
    dated: true,
    note: 'Completed invoice totals by local invoice date, including credit sales. Refunds are reported separately in Sales Returns; this is gross completed-invoice sales, not net revenue or profit.',
    columns: [
      column('month', 'Month'),
      column('invoices', 'Invoices'),
      column('sales', 'Invoice sales', true),
      column('average', 'Average invoice', true),
    ],
    query: `SELECT strftime('%Y-%m',invoice_date,'localtime') AS month,COUNT(*) AS invoices,SUM(net_amount) AS sales,AVG(net_amount) AS average FROM sales_invoices WHERE status='completed' AND DATE(invoice_date,'localtime')>=? AND DATE(invoice_date,'localtime')<=? GROUP BY month ORDER BY month`,
  },
];
export function reportParameters(report: ReportDefinition, from: string, to: string): string[] {
  if (!report.dated) return [];
  return report.id === 'bank-balances' ? [from, from, to, to] : [from, to];
}
