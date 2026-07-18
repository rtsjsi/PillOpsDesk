import { ipcMain } from 'electron';
import { IPC } from '@shared/api';
import type {
  MedicineInput,
  BatchInput,
  SupplierInput,
  CustomerInput,
  PurchaseInput,
  SaleInput,
  Settings,
} from '@shared/types';
import * as medicines from '../db/services/medicines';
import * as batches from '../db/services/batches';
import * as parties from '../db/services/parties';
import * as purchases from '../db/services/purchases';
import * as sales from '../db/services/sales';
import * as reports from '../db/services/reports';
import * as settings from '../db/services/settings';
import * as auth from '../db/services/auth';
import { backupDatabase, restoreDatabase, exportCsv } from './backup';
import { printInvoice } from './invoice';

// Wraps a handler so thrown errors surface with a clean message in the renderer.
function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    return fn(...(args as T));
  });
}

export function registerIpc(): void {
  // Auth
  handle(IPC.authHasUsers, () => auth.hasUsers());
  handle(IPC.authRegister, (username: string, pin: string, role: 'owner' | 'staff') =>
    auth.registerUser(username, pin, role)
  );
  handle(IPC.authLogin, (username: string, pin: string) => auth.login(username, pin));
  handle(IPC.authGetUser, (id: number) => auth.getUser(id));
  handle(IPC.authListUsers, () => auth.listUsers());
  handle(IPC.authDeleteUser, (id: number) => auth.deleteUser(id));

  // Medicines
  handle(IPC.medicinesList, (search?: string) => medicines.listMedicines(search));
  handle(IPC.medicinesGet, (id: number) => medicines.getMedicine(id));
  handle(IPC.medicinesCreate, (input: MedicineInput) => medicines.createMedicine(input));
  handle(IPC.medicinesUpdate, (id: number, input: MedicineInput) =>
    medicines.updateMedicine(id, input)
  );
  handle(IPC.medicinesRemove, (id: number) => medicines.removeMedicine(id));

  // Batches
  handle(IPC.batchesListByMedicine, (id: number) => batches.listBatchesByMedicine(id));
  handle(IPC.batchesCreate, (input: BatchInput) => batches.createBatch(input));
  handle(IPC.batchesUpdate, (id: number, input: BatchInput) =>
    batches.updateBatch(id, input)
  );
  handle(IPC.batchesRemove, (id: number) => batches.removeBatch(id));
  handle(IPC.batchesStock, (search?: string) => batches.listStock(search));

  // Suppliers
  handle(IPC.suppliersList, (search?: string) => parties.listSuppliers(search));
  handle(IPC.suppliersCreate, (input: SupplierInput) => parties.createSupplier(input));
  handle(IPC.suppliersUpdate, (id: number, input: SupplierInput) =>
    parties.updateSupplier(id, input)
  );
  handle(IPC.suppliersRemove, (id: number) => parties.removeSupplier(id));

  // Customers
  handle(IPC.customersList, (search?: string) => parties.listCustomers(search));
  handle(IPC.customersCreate, (input: CustomerInput) => parties.createCustomer(input));
  handle(IPC.customersUpdate, (id: number, input: CustomerInput) =>
    parties.updateCustomer(id, input)
  );
  handle(IPC.customersRemove, (id: number) => parties.removeCustomer(id));

  // Purchases
  handle(IPC.purchasesCreate, (input: PurchaseInput) => purchases.createPurchase(input));
  handle(IPC.purchasesList, (search?: string) => purchases.listPurchases(search));

  // Sales
  handle(IPC.salesSearchSellable, (search: string) => sales.searchSellable(search));
  handle(IPC.salesCreate, (input: SaleInput) => sales.createSale(input));
  handle(IPC.salesList, (from?: string, to?: string) => sales.listSales(from, to));
  handle(IPC.salesGet, (id: number) => sales.getSale(id));

  // Reports
  handle(IPC.reportsDashboard, () => reports.getDashboard());
  handle(IPC.reportsLowStock, () => reports.getLowStock());
  handle(IPC.reportsExpiring, (withinDays?: number) => reports.getExpiring(withinDays));
  handle(IPC.reportsExpiredInStock, () => reports.getExpiredInStock());
  handle(IPC.reportsSalesReport, (from: string, to: string) =>
    reports.getSalesReport(from, to)
  );
  handle(IPC.reportsGstSummary, (from: string, to: string) =>
    reports.getGstSummary(from, to)
  );
  handle(IPC.reportsStockValuation, () => reports.getStockValuation());
  handle(IPC.reportsExportCsv, (filename: string, csv: string) =>
    exportCsv(filename, csv)
  );

  // Settings
  handle(IPC.settingsGet, () => settings.getSettings());
  handle(IPC.settingsSave, (input: Settings) => settings.saveSettings(input));

  // Backup
  handle(IPC.backupBackup, () => backupDatabase());
  handle(IPC.backupRestore, () => restoreDatabase());

  // Print
  handle(IPC.printInvoice, (saleId: number) => printInvoice(saleId));
}
