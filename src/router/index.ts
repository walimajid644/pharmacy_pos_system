import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
      children: [
        {path:'/catalog-import',name:'catalog-import',component:()=>import('@/views/CatalogImportView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/catalog-bulk',name:'catalog-bulk',component:()=>import('@/views/CatalogBulkView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/controlled-sales',name:'controlled-sales',component:()=>import('@/views/ControlledSalesView.vue'),meta:{requiresAuth:true,roles:['admin','manager','accountant']}},
        {path:'/fbr-sandbox',name:'fbr-sandbox',component:()=>import('@/views/FbrSandboxView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/purchase-suggestions',name:'purchase-suggestions',component:()=>import('@/views/PurchaseSuggestionsView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/audit-log',name:'audit-log',component:()=>import('@/views/AuditLogView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/customer-ledger',name:'customer-ledger',component:()=>import('@/views/CustomerLedgerView.vue'),meta:{requiresAuth:true,roles:['admin','manager','cashier','accountant']}},
        {path:'/expiry-actions',name:'expiry-actions',component:()=>import('@/views/ExpiryActionsView.vue'),meta:{requiresAuth:true,roles:['admin','manager']}},
        {path:'/cashier-performance',name:'cashier-performance',component:()=>import('@/views/CashierPerformanceView.vue'),meta:{requiresAuth:true,roles:['admin','manager','accountant']}},
        { path:'/payments', name:'payments', component:()=>import('@/views/FinanceView.vue'), meta:{requiresAuth:true,roles:['admin','manager','accountant']} },
        { path:'/expenses', name:'expenses', component:()=>import('@/views/FinanceView.vue'), meta:{requiresAuth:true,roles:['admin','manager','accountant']} },
        { path:'/estimates', name:'estimates', component:()=>import('@/views/CommercialDocumentsView.vue'), meta:{requiresAuth:true,roles:['admin','manager','cashier']} },
        { path:'/preorders', name:'preorders', component:()=>import('@/views/CommercialDocumentsView.vue'), meta:{requiresAuth:true,roles:['admin','manager','cashier']} },
        { path:'/item-search', name:'item-search', component:()=>import('@/views/AdvancedItemSearchView.vue'), meta:{requiresAuth:true} },
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: '/pos',
          name: 'pos',
          component: () => import('@/views/POSView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager', 'cashier'] },
        },
        {
          path: '/products',
          name: 'products',
          component: () => import('@/views/ProductsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/customers',
          name: 'customers',
          component: () => import('@/views/CustomersView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager', 'cashier'] },
        },
        {
          path: '/sales-history',
          name: 'sales-history',
          component: () => import('@/views/SalesHistoryView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager', 'accountant'] },
        },
        {
          path: '/daily-closing',
          name: 'daily-closing',
          component: () => import('@/views/DailyClosingView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/shifts',
          name: 'shifts',
          component: () => import('@/views/ShiftsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager', 'cashier'] },
        },
        {
          path: '/reports',
          name: 'reports',
          component: () => import('@/views/ReportsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager', 'accountant'] },
        },
        {
          path: '/users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { requiresAuth: true, roles: ['admin'] },
        },
        {
          path: '/settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/backups',
          name: 'backups',
          component: () => import('@/views/BackupView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/suppliers',
          name: 'suppliers',
          component: () => import('@/views/SuppliersView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/supplier-ledger',
          name: 'supplier-ledger',
          component: () => import('@/views/SupplierLedgerView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/purchase-orders',
          name: 'purchase-orders',
          component: () => import('@/views/PurchaseOrdersView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/purchase-orders/new',
          name: 'purchase-order-new',
          component: () => import('@/views/PurchaseOrderFormView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/purchase-orders/:id',
          name: 'purchase-order-edit',
          component: () => import('@/views/PurchaseOrderFormView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/purchase-orders/:id/receive',
          name: 'purchase-order-receive',
          component: () => import('@/views/PurchaseOrderReceiveView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/stock-adjustments',
          name: 'stock-adjustments',
          component: () => import('@/views/StockAdjustmentsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/stock-adjustments/new',
          name: 'stock-adjustment-new',
          component: () => import('@/views/StockAdjustmentFormView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/sales-returns',
          name: 'sales-returns',
          component: () => import('@/views/SalesReturnsView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
        {
          path: '/sales-returns/new',
          name: 'sales-return-new',
          component: () => import('@/views/SalesReturnFormView.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'manager'] },
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (authStore.currentUser?.must_change_password && to.path !== '/change-password') {
    next('/change-password')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else if (to.meta.roles && !authStore.hasRole(to.meta.roles as import('@/lib/types').UserRole[])) {
    next('/')
  } else {
    next()
  }
})

export default router
