import type { MedicineInput, PurchaseInput, SaleInput } from '../../src/shared/types';
import { createBatch } from '../../src/db/services/batches';
import { createMedicine } from '../../src/db/services/medicines';

export function medicineInput(overrides: Partial<MedicineInput> & Pick<MedicineInput, 'name'>): MedicineInput {
  return {
    generic_name: '',
    manufacturer: '',
    hsn_code: '',
    gst_rate: 12,
    category: '',
    rack: '',
    reorder_level: 10,
    ...overrides,
  };
}

export function saleInput(
  items: SaleInput['items'],
  overrides: Partial<Omit<SaleInput, 'items'>> = {}
): SaleInput {
  return {
    customer_id: null,
    discount_percent: 0,
    items,
    ...overrides,
  };
}

export function purchaseInput(
  items: PurchaseInput['items'],
  overrides: Partial<Omit<PurchaseInput, 'items'>> = {}
): PurchaseInput {
  return {
    supplier_id: null,
    invoice_no: null,
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: null,
    items,
    ...overrides,
  };
}

export function futureExpiry(yearsFromNow = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsFromNow);
  return d.toISOString().slice(0, 10);
}

export function pastExpiry(yearsAgo = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  return d.toISOString().slice(0, 10);
}

export function seedMedicineWithBatch(
  opts: {
    name?: string;
    gst_rate?: number;
    sale_price?: number;
    quantity?: number;
    expiry_date?: string;
    batch_no?: string;
  } = {}
) {
  const med = createMedicine(
    medicineInput({
      name: opts.name ?? 'Paracetamol 500mg',
      generic_name: 'Paracetamol',
      manufacturer: 'Test Pharma',
      hsn_code: '3004',
      gst_rate: opts.gst_rate ?? 12,
      category: 'Tablet',
      rack: 'A1',
      reorder_level: 10,
    })
  );
  const batch = createBatch({
    medicine_id: med.id,
    batch_no: opts.batch_no ?? 'B001',
    expiry_date: opts.expiry_date ?? futureExpiry(),
    mrp: opts.sale_price ?? 100,
    purchase_price: 80,
    sale_price: opts.sale_price ?? 100,
    quantity_in_stock: opts.quantity ?? 50,
  });
  return { med, batch };
}
