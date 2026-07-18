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
import * as licensing from '../db/services/licensing';
import { backupDatabase, restoreDatabase, exportCsv } from './backup';
import { printInvoice } from './invoice';

function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    return fn(...(args as T));
  });
}

function handleLicensed<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    licensing.assertAppUsable();
    return fn(...(args as T));
  });
}

export function registerIpc(): void {
  // Licensing (always available)
  handle(IPC.licenseGetStatus, () => licensing.getLicenseStatus());
  handle(IPC.licenseGetMachineId, () => licensing.getMachineId());
  handle(IPC.licenseActivate, (licenseKey: string) => licensing.activateLicense(licenseKey));

  // Auth
  handleLicensed(IPC.authHasUsers, () => auth.hasUsers());
  handleLicensed(IPC.authRegister, (username: string, pin: string, role: 'owner' | 'staff') =>
    auth.registerUser(username, pin, role)
  );
  handleLicensed(IPC.authLogin, (username: string, pin: string) => auth.login(username, pin));
  handleLicensed(IPC.authGetUser, (id: number) => auth.getUser(id));
  handleLicensed(IPC.authListUsers, () => auth.listUsers());
  handleLicensed(IPC.authDeleteUser, (id: number) => auth.deleteUser(id));

  // Medicines
  handleLicensed(IPC.medicinesList, (search?: string) => medicines.listMedicines(search));
  handleLicensed(IPC.medicinesGet, (id: number) => medicines.getMedicine(id));
  handleLicensed(IPC.medicinesCreate, (input: MedicineInput) => medicines.createMedicine(input));
  handleLicensed(IPC.medicinesUpdate, (id: number, input: MedicineInput) =>
    medicines.updateMedicine(id, input)
  );
  handleLicensed(IPC.medicinesRemove, (id: number) => medicines.removeMedicine(id));

  // Batches
  handleLicensed(IPC.batchesListByMedicine, (id: number) => batches.listBatchesByMedicine(id));
  handleLicensed(IPC.batchesCreate, (input: BatchInput) => batches.createBatch(input));
  handleLicensed(IPC.batchesUpdate, (id: number, input: BatchInput) =>
    batches.updateBatch(id, input)
  );
  handleLicensed(IPC.batchesRemove, (id: number) => batches.removeBatch(id));
  handleLicensed(IPC.batchesStock, (search?: string) => batches.listStock(search));

  // Suppliers
  handleLicensed(IPC.suppliersList, (search?: string) => parties.listSuppliers(search));
  handleLicensed(IPC.suppliersCreate, (input: SupplierInput) => parties.createSupplier(input));
  handleLicensed(IPC.suppliersUpdate, (id: number, input: SupplierInput) =>
    parties.updateSupplier(id, input)
  );
  handleLicensed(IPC.suppliersRemove, (id: number) => parties.removeSupplier(id));

  // Customers
  handleLicensed(IPC.customersList, (search?: string) => parties.listCustomers(search));
  handleLicensed(IPC.customersCreate, (input: CustomerInput) => parties.createCustomer(input));
  handleLicensed(IPC.customersUpdate, (id: number, input: CustomerInput) =>
    parties.updateCustomer(id, input)
  );
  handleLicensed(IPC.customersRemove, (id: number) => parties.removeCustomer(id));

  // Purchases
  handleLicensed(IPC.purchasesCreate, (input: PurchaseInput) => purchases.createPurchase(input));
  handleLicensed(IPC.purchasesList, (search?: string) => purchases.listPurchases(search));

  // Sales
  handleLicensed(IPC.salesSearchSellable, (search: string) => sales.searchSellable(search));
  handleLicensed(IPC.salesCreate, (input: SaleInput) => sales.createSale(input));
  handleLicensed(IPC.salesList, (from?: string, to?: string) => sales.listSales(from, to));
  handleLicensed(IPC.salesGet, (id: number) => sales.getSale(id));

  // Reports
  handleLicensed(IPC.reportsDashboard, () => reports.getDashboard());
  handleLicensed(IPC.reportsLowStock, () => reports.getLowStock());
  handleLicensed(IPC.reportsExpiring, (withinDays?: number) => reports.getExpiring(withinDays));
  handleLicensed(IPC.reportsExpiredInStock, () => reports.getExpiredInStock());
  handleLicensed(IPC.reportsSalesReport, (from: string, to: string) =>
    reports.getSalesReport(from, to)
  );
  handleLicensed(IPC.reportsGstSummary, (from: string, to: string) =>
    reports.getGstSummary(from, to)
  );
  handleLicensed(IPC.reportsStockValuation, () => reports.getStockValuation());
  handleLicensed(IPC.reportsExportCsv, (filename: string, csv: string) =>
    exportCsv(filename, csv)
  );

  // Settings
  handleLicensed(IPC.settingsGet, () => settings.getSettings());
  handleLicensed(IPC.settingsSave, (input: Settings) => settings.saveSettings(input));

  // Backup
  handleLicensed(IPC.backupBackup, () => backupDatabase());
  handleLicensed(IPC.backupRestore, () => restoreDatabase());

  // Print
  handleLicensed(IPC.printInvoice, (saleId: number) => printInvoice(saleId));
}
