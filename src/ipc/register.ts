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
  DriveBackupSettings,
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
import {
  backupToDriveNow,
  connectDrive,
  disconnectDrive,
  getDriveStatus,
  listCloudBackups,
  restoreFromDrive,
  saveDriveSettings,
} from './google-drive';
import { printInvoice } from './invoice';

function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    return fn(...(args as T));
  });
}

function handleRead<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    licensing.assertAppUsable();
    return fn(...(args as T));
  });
}

function handleWrite<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    licensing.assertWriteAllowed();
    return fn(...(args as T));
  });
}

export function registerIpc(): void {
  // Licensing (always available)
  handle(IPC.licenseGetStatus, () => licensing.getLicenseStatus());
  handle(IPC.licenseGetMachineId, () => licensing.getMachineId());
  handle(IPC.licenseActivate, (licenseKey: string) => licensing.activateLicense(licenseKey));

  // Auth — login/list allowed in read-only; account changes require write access
  handleRead(IPC.authHasUsers, () => auth.hasUsers());
  handleWrite(IPC.authRegister, (username: string, pin: string, role: 'owner' | 'staff') =>
    auth.registerUser(username, pin, role)
  );
  handleRead(IPC.authLogin, (username: string, pin: string) => auth.login(username, pin));
  handleRead(IPC.authGetUser, (id: number) => auth.getUser(id));
  handleRead(IPC.authListUsers, () => auth.listUsers());
  handleWrite(IPC.authDeleteUser, (id: number) => auth.deleteUser(id));

  // Medicines
  handleRead(IPC.medicinesList, (search?: string) => medicines.listMedicines(search));
  handleRead(IPC.medicinesGet, (id: number) => medicines.getMedicine(id));
  handleWrite(IPC.medicinesCreate, (input: MedicineInput) => medicines.createMedicine(input));
  handleWrite(IPC.medicinesUpdate, (id: number, input: MedicineInput) =>
    medicines.updateMedicine(id, input)
  );
  handleWrite(IPC.medicinesRemove, (id: number) => medicines.removeMedicine(id));

  // Batches
  handleRead(IPC.batchesListByMedicine, (id: number) => batches.listBatchesByMedicine(id));
  handleWrite(IPC.batchesCreate, (input: BatchInput) => batches.createBatch(input));
  handleWrite(IPC.batchesUpdate, (id: number, input: BatchInput) =>
    batches.updateBatch(id, input)
  );
  handleWrite(IPC.batchesRemove, (id: number) => batches.removeBatch(id));
  handleRead(IPC.batchesStock, (search?: string) => batches.listStock(search));

  // Suppliers
  handleRead(IPC.suppliersList, (search?: string) => parties.listSuppliers(search));
  handleWrite(IPC.suppliersCreate, (input: SupplierInput) => parties.createSupplier(input));
  handleWrite(IPC.suppliersUpdate, (id: number, input: SupplierInput) =>
    parties.updateSupplier(id, input)
  );
  handleWrite(IPC.suppliersRemove, (id: number) => parties.removeSupplier(id));

  // Customers
  handleRead(IPC.customersList, (search?: string) => parties.listCustomers(search));
  handleWrite(IPC.customersCreate, (input: CustomerInput) => parties.createCustomer(input));
  handleWrite(IPC.customersUpdate, (id: number, input: CustomerInput) =>
    parties.updateCustomer(id, input)
  );
  handleWrite(IPC.customersRemove, (id: number) => parties.removeCustomer(id));

  // Purchases
  handleWrite(IPC.purchasesCreate, (input: PurchaseInput) => purchases.createPurchase(input));
  handleRead(IPC.purchasesList, (search?: string) => purchases.listPurchases(search));
  handleRead(IPC.purchasesGet, (id: number) => purchases.getPurchase(id));
  handleWrite(IPC.purchasesUpdate, (id: number, input: PurchaseInput) =>
    purchases.updatePurchase(id, input)
  );

  // Sales
  handleRead(IPC.salesSearchSellable, (search: string) => sales.searchSellable(search));
  handleWrite(IPC.salesCreate, (input: SaleInput) => sales.createSale(input));
  handleRead(IPC.salesList, (from?: string, to?: string) => sales.listSales(from, to));
  handleRead(IPC.salesGet, (id: number) => sales.getSale(id));
  handleWrite(IPC.salesUpdate, (id: number, input: SaleInput) => sales.updateSale(id, input));

  // Reports (read-only friendly)
  handleRead(IPC.reportsDashboard, () => reports.getDashboard());
  handleRead(IPC.reportsLowStock, () => reports.getLowStock());
  handleRead(IPC.reportsExpiring, (withinDays?: number) => reports.getExpiring(withinDays));
  handleRead(IPC.reportsExpiredInStock, () => reports.getExpiredInStock());
  handleRead(IPC.reportsSalesReport, (from: string, to: string) =>
    reports.getSalesReport(from, to)
  );
  handleRead(IPC.reportsGstSummary, (from: string, to: string) =>
    reports.getGstSummary(from, to)
  );
  handleRead(IPC.reportsStockValuation, () => reports.getStockValuation());
  handleRead(IPC.reportsExportCsv, (filename: string, csv: string) =>
    exportCsv(filename, csv)
  );

  // Settings
  handleRead(IPC.settingsGet, () => settings.getSettings());
  handleWrite(IPC.settingsSave, (input: Settings) => settings.saveSettings(input));

  // Backup — export allowed in read-only; restore replaces all data
  handleRead(IPC.backupBackup, () => backupDatabase());
  handleWrite(IPC.backupRestore, () => restoreDatabase());

  // Google Drive backup — backup/export allowed in read-only; connect/restore need write access
  handleRead(IPC.driveGetStatus, () => getDriveStatus());
  handleWrite(IPC.driveConnect, () => connectDrive());
  handleWrite(IPC.driveDisconnect, () => disconnectDrive());
  handleWrite(IPC.driveSaveSettings, (input: DriveBackupSettings) => saveDriveSettings(input));
  handleRead(IPC.driveBackupNow, () => backupToDriveNow());
  handleRead(IPC.driveListBackups, () => listCloudBackups());
  handleWrite(IPC.driveRestore, () => restoreFromDrive());

  // Reprinting past invoices is allowed in read-only
  handleRead(IPC.printInvoice, (saleId: number) => printInvoice(saleId));
}
