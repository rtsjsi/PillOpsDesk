// Domain types shared between the Electron main process and the React renderer.

export type MedicineSchedule = 'OTC' | 'H' | 'H1' | 'X';
export type MedicineStorageType = 'room' | 'refrigerated';

export interface Medicine {
  id: number;
  name: string;
  generic_name: string | null;
  manufacturer: string | null;
  hsn_code: string | null;
  gst_rate: number; // percent, e.g. 5, 12, 18
  dosage_form: string | null; // e.g. Tablet, Capsule, Syrup
  category: string | null; // therapeutic class, e.g. Anti-Diabetic
  pack_size: string | null; // e.g. "15", "100ml"
  schedule: MedicineSchedule | null;
  storage_type: MedicineStorageType | null;
  rack: string | null;
  reorder_level: number;
  is_active: number; // 0 | 1
  created_at: string;
}

export type MedicineInput = Omit<Medicine, 'id' | 'created_at' | 'is_active'> & {
  is_active?: number;
};

export interface Batch {
  id: number;
  medicine_id: number;
  batch_no: string;
  expiry_date: string; // ISO yyyy-mm-dd
  mrp: number;
  purchase_price: number;
  sale_price: number;
  quantity_in_stock: number;
  created_at: string;
}

export type BatchInput = Omit<Batch, 'id' | 'created_at'>;

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  created_at: string;
}

export type SupplierInput = Omit<Supplier, 'id' | 'created_at'>;

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at'>;

export interface Purchase {
  id: number;
  supplier_id: number | null;
  invoice_no: string | null;
  purchase_date: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
}

export interface PurchaseItemInput {
  medicine_id: number;
  batch_no: string;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
  sale_price: number;
  gst_rate: number;
  quantity: number;
}

export interface PurchaseInput {
  supplier_id: number | null;
  invoice_no: string | null;
  purchase_date: string;
  notes: string | null;
  items: PurchaseItemInput[];
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  batch_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_no: string;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
  sale_price: number;
  gst_rate: number;
  quantity: number;
}

export interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
  supplier_name: string | null;
}

export interface Sale {
  id: number;
  invoice_no: string;
  customer_id: number | null;
  sale_date: string;
  subtotal: number;
  discount: number; // rupee amount saved by invoice discount
  discount_percent: number;
  cgst: number;
  sgst: number;
  total: number;
  created_at: string;
}

export interface SaleItemInput {
  batch_id: number;
  quantity: number;
}

export interface SaleInput {
  customer_id: number | null;
  items: SaleItemInput[];
  discount_percent: number;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  batch_id: number | null;
  medicine_id: number;
  medicine_name: string;
  batch_no: string;
  hsn_code: string | null;
  quantity: number;
  price: number;
  gst_rate: number;
  discount: number;
  line_total: number;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
  customer_name: string | null;
}

// A sellable line as shown in the sales screen (a batch joined with its medicine).
export interface SellableBatch {
  batch_id: number;
  medicine_id: number;
  name: string;
  batch_no: string;
  expiry_date: string;
  sale_price: number;
  mrp: number;
  gst_rate: number;
  hsn_code: string | null;
  quantity_in_stock: number;
}

export interface StockRow extends Batch {
  medicine_name: string;
  gst_rate: number;
  reorder_level: number;
}

export interface Settings {
  store_name: string;
  address: string;
  phone: string;
  gstin: string;
  dl_no: string; // drug licence number
  invoice_prefix: string;
  expiry_alert_days: number;
}

export interface User {
  id: number;
  username: string;
  role: 'owner' | 'staff';
  created_at: string;
}

export interface DashboardStats {
  todaySalesTotal: number;
  todayInvoiceCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalMedicines: number;
}

export interface SalesReportRow {
  date: string;
  invoice_count: number;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface GstSummaryRow {
  gst_rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  total_tax: number;
}

export interface LicensePayload {
  pharmacy_id: string;
  pharmacy_name: string;
  machine_id: string;
  issued: string;
  expires: string;
  grace_days: number;
}

export type LicenseState = 'active' | 'grace' | 'readonly' | 'blocked' | 'unlicensed';

export interface LicenseStatus {
  state: LicenseState;
  machineId: string;
  pharmacyId?: string;
  pharmacyName?: string;
  expires?: string;
  graceEnds?: string;
  daysRemaining?: number;
  message: string;
  clockTampered?: boolean;
  /** True when subscription is past expiry + grace; viewing allowed, writes blocked. */
  readOnly?: boolean;
}

export interface DriveBackupSettings {
  auto_enabled: boolean;
  /** Daily backup time in 24h HH:mm format. */
  auto_time: string;
}

export interface DriveBackupStatus extends DriveBackupSettings {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  lastBackupAt: string | null;
  lastError: string | null;
  backupInProgress: boolean;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  createdAt: string;
  size: number;
}
