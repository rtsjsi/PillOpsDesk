// The contract for the API exposed to the renderer via contextBridge.
// Both preload.ts and the renderer import this type.

import type {
  Medicine,
  MedicineInput,
  Batch,
  BatchInput,
  Supplier,
  SupplierInput,
  Customer,
  CustomerInput,
  PurchaseInput,
  Purchase,
  SaleInput,
  SaleWithItems,
  SellableBatch,
  StockRow,
  Settings,
  User,
  DashboardStats,
  SalesReportRow,
  GstSummaryRow,
  LicenseStatus,
} from './types';

export interface PharmacyApi {
  auth: {
    hasUsers: () => Promise<boolean>;
    register: (username: string, pin: string, role: 'owner' | 'staff') => Promise<User>;
    login: (username: string, pin: string) => Promise<User | null>;
    getUser: (id: number) => Promise<User | null>;
    listUsers: () => Promise<User[]>;
    deleteUser: (id: number) => Promise<void>;
  };
  medicines: {
    list: (search?: string) => Promise<Medicine[]>;
    get: (id: number) => Promise<Medicine | null>;
    create: (input: MedicineInput) => Promise<Medicine>;
    update: (id: number, input: MedicineInput) => Promise<Medicine>;
    remove: (id: number) => Promise<void>;
  };
  batches: {
    listByMedicine: (medicineId: number) => Promise<Batch[]>;
    create: (input: BatchInput) => Promise<Batch>;
    update: (id: number, input: BatchInput) => Promise<Batch>;
    remove: (id: number) => Promise<void>;
    stock: (search?: string) => Promise<StockRow[]>;
  };
  suppliers: {
    list: (search?: string) => Promise<Supplier[]>;
    create: (input: SupplierInput) => Promise<Supplier>;
    update: (id: number, input: SupplierInput) => Promise<Supplier>;
    remove: (id: number) => Promise<void>;
  };
  customers: {
    list: (search?: string) => Promise<Customer[]>;
    create: (input: CustomerInput) => Promise<Customer>;
    update: (id: number, input: CustomerInput) => Promise<Customer>;
    remove: (id: number) => Promise<void>;
  };
  purchases: {
    create: (input: PurchaseInput) => Promise<Purchase>;
    list: (search?: string) => Promise<Purchase[]>;
  };
  sales: {
    searchSellable: (search: string) => Promise<SellableBatch[]>;
    create: (input: SaleInput) => Promise<SaleWithItems>;
    list: (from?: string, to?: string) => Promise<SaleWithItems[]>;
    get: (id: number) => Promise<SaleWithItems | null>;
  };
  reports: {
    dashboard: () => Promise<DashboardStats>;
    lowStock: () => Promise<StockRow[]>;
    expiring: (withinDays?: number) => Promise<StockRow[]>;
    expiredInStock: () => Promise<StockRow[]>;
    salesReport: (from: string, to: string) => Promise<SalesReportRow[]>;
    gstSummary: (from: string, to: string) => Promise<GstSummaryRow[]>;
    stockValuation: () => Promise<StockRow[]>;
    exportCsv: (filename: string, csv: string) => Promise<boolean>;
  };
  settings: {
    get: () => Promise<Settings>;
    save: (settings: Settings) => Promise<Settings>;
  };
  backup: {
    backup: () => Promise<string | null>;
    restore: () => Promise<boolean>;
  };
  print: {
    invoice: (saleId: number) => Promise<boolean>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    getMachineId: () => Promise<string>;
    activate: (licenseKey: string) => Promise<LicenseStatus>;
  };
}

export const IPC = {
  authHasUsers: 'auth:hasUsers',
  authRegister: 'auth:register',
  authLogin: 'auth:login',
  authGetUser: 'auth:getUser',
  authListUsers: 'auth:listUsers',
  authDeleteUser: 'auth:deleteUser',

  medicinesList: 'medicines:list',
  medicinesGet: 'medicines:get',
  medicinesCreate: 'medicines:create',
  medicinesUpdate: 'medicines:update',
  medicinesRemove: 'medicines:remove',

  batchesListByMedicine: 'batches:listByMedicine',
  batchesCreate: 'batches:create',
  batchesUpdate: 'batches:update',
  batchesRemove: 'batches:remove',
  batchesStock: 'batches:stock',

  suppliersList: 'suppliers:list',
  suppliersCreate: 'suppliers:create',
  suppliersUpdate: 'suppliers:update',
  suppliersRemove: 'suppliers:remove',

  customersList: 'customers:list',
  customersCreate: 'customers:create',
  customersUpdate: 'customers:update',
  customersRemove: 'customers:remove',

  purchasesCreate: 'purchases:create',
  purchasesList: 'purchases:list',

  salesSearchSellable: 'sales:searchSellable',
  salesCreate: 'sales:create',
  salesList: 'sales:list',
  salesGet: 'sales:get',

  reportsDashboard: 'reports:dashboard',
  reportsLowStock: 'reports:lowStock',
  reportsExpiring: 'reports:expiring',
  reportsExpiredInStock: 'reports:expiredInStock',
  reportsSalesReport: 'reports:salesReport',
  reportsGstSummary: 'reports:gstSummary',
  reportsStockValuation: 'reports:stockValuation',
  reportsExportCsv: 'reports:exportCsv',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',

  backupBackup: 'backup:backup',
  backupRestore: 'backup:restore',

  printInvoice: 'print:invoice',

  licenseGetStatus: 'license:getStatus',
  licenseGetMachineId: 'license:getMachineId',
  licenseActivate: 'license:activate',
} as const;
