import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/api';
import type { PharmacyApi } from './shared/api';
import type { UpdateDownloadProgress } from './shared/types';

const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);

const api: PharmacyApi = {
  auth: {
    hasUsers: () => invoke(IPC.authHasUsers),
    register: (username, pin, role) => invoke(IPC.authRegister, username, pin, role),
    login: (username, pin) => invoke(IPC.authLogin, username, pin),
    getUser: (id) => invoke(IPC.authGetUser, id),
    listUsers: () => invoke(IPC.authListUsers),
    deleteUser: (id) => invoke(IPC.authDeleteUser, id),
  },
  medicines: {
    list: (search) => invoke(IPC.medicinesList, search),
    get: (id) => invoke(IPC.medicinesGet, id),
    create: (input) => invoke(IPC.medicinesCreate, input),
    update: (id, input) => invoke(IPC.medicinesUpdate, id, input),
    remove: (id) => invoke(IPC.medicinesRemove, id),
  },
  batches: {
    listByMedicine: (medicineId) => invoke(IPC.batchesListByMedicine, medicineId),
    create: (input) => invoke(IPC.batchesCreate, input),
    update: (id, input) => invoke(IPC.batchesUpdate, id, input),
    remove: (id) => invoke(IPC.batchesRemove, id),
    stock: (search) => invoke(IPC.batchesStock, search),
  },
  suppliers: {
    list: (search) => invoke(IPC.suppliersList, search),
    create: (input) => invoke(IPC.suppliersCreate, input),
    update: (id, input) => invoke(IPC.suppliersUpdate, id, input),
    remove: (id) => invoke(IPC.suppliersRemove, id),
  },
  customers: {
    list: (search) => invoke(IPC.customersList, search),
    create: (input) => invoke(IPC.customersCreate, input),
    update: (id, input) => invoke(IPC.customersUpdate, id, input),
    remove: (id) => invoke(IPC.customersRemove, id),
  },
  purchases: {
    create: (input) => invoke(IPC.purchasesCreate, input),
    list: (from, to) => invoke(IPC.purchasesList, from, to),
    get: (id) => invoke(IPC.purchasesGet, id),
    update: (id, input) => invoke(IPC.purchasesUpdate, id, input),
  },
  sales: {
    searchSellable: (search) => invoke(IPC.salesSearchSellable, search),
    create: (input) => invoke(IPC.salesCreate, input),
    list: (from, to) => invoke(IPC.salesList, from, to),
    get: (id) => invoke(IPC.salesGet, id),
    update: (id, input) => invoke(IPC.salesUpdate, id, input),
  },
  reports: {
    dashboard: () => invoke(IPC.reportsDashboard),
    lowStock: () => invoke(IPC.reportsLowStock),
    expiring: (withinDays) => invoke(IPC.reportsExpiring, withinDays),
    expiredInStock: () => invoke(IPC.reportsExpiredInStock),
    salesReport: (from, to) => invoke(IPC.reportsSalesReport, from, to),
    purchasesReport: (from, to) => invoke(IPC.reportsPurchasesReport, from, to),
    gstSummary: (from, to) => invoke(IPC.reportsGstSummary, from, to),
    stockValuation: () => invoke(IPC.reportsStockValuation),
    exportCsv: (filename, csv) => invoke(IPC.reportsExportCsv, filename, csv),
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    save: (settings) => invoke(IPC.settingsSave, settings),
  },
  backup: {
    backup: () => invoke(IPC.backupBackup),
    restore: () => invoke(IPC.backupRestore),
  },
  drive: {
    getStatus: () => invoke(IPC.driveGetStatus),
    connect: () => invoke(IPC.driveConnect),
    disconnect: () => invoke(IPC.driveDisconnect),
    saveSettings: (settings) => invoke(IPC.driveSaveSettings, settings),
    backupNow: () => invoke(IPC.driveBackupNow),
    listBackups: () => invoke(IPC.driveListBackups),
    restore: () => invoke(IPC.driveRestore),
  },
  print: {
    invoice: (saleId) => invoke(IPC.printInvoice, saleId),
  },
  license: {
    getStatus: () => invoke(IPC.licenseGetStatus),
    getMachineId: () => invoke(IPC.licenseGetMachineId),
    activate: (licenseKey) => invoke(IPC.licenseActivate, licenseKey),
  },
  updates: {
    getVersion: () => invoke(IPC.updatesGetVersion),
    check: () => invoke(IPC.updatesCheck),
    apply: (manifest) => invoke(IPC.updatesApply, manifest),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: UpdateDownloadProgress) =>
        callback(progress);
      ipcRenderer.on(IPC.updatesProgress, handler);
      return () => ipcRenderer.removeListener(IPC.updatesProgress, handler);
    },
  },
};

contextBridge.exposeInMainWorld('pharmacy', api);
