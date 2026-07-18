import { describe, expect, it } from 'vitest';
import { listBatchesByMedicine } from '../src/db/services/batches';
import { createMedicine } from '../src/db/services/medicines';
import { createSupplier } from '../src/db/services/parties';
import { createPurchase, listPurchases } from '../src/db/services/purchases';
import { futureExpiry, medicineInput, purchaseInput } from './helpers/fixtures';

describe('purchases', () => {
  it('creates a purchase and adds stock via new batch', () => {
    const med = createMedicine(
      medicineInput({ name: 'Amoxicillin', gst_rate: 12, reorder_level: 5 })
    );
    const supplier = createSupplier({
      name: 'MedSupply Co',
      phone: '',
      address: '',
      gstin: '',
    });

    const purchase = createPurchase(
      purchaseInput(
        [
          {
            medicine_id: med.id,
            batch_no: 'AMX01',
            expiry_date: futureExpiry(),
            quantity: 100,
            mrp: 150,
            purchase_price: 120,
            sale_price: 140,
            gst_rate: 12,
          },
        ],
        { supplier_id: supplier.id, invoice_no: 'PO-100' }
      )
    );

    expect(purchase.total_amount).toBe(12000);
    expect(listPurchases()).toHaveLength(1);

    const batches = listBatchesByMedicine(med.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity_in_stock).toBe(100);
    expect(batches[0].batch_no).toBe('AMX01');
  });

  it('merges stock into existing batch with same batch_no and expiry', () => {
    const med = createMedicine(
      medicineInput({ name: 'Cetirizine', gst_rate: 5, reorder_level: 10 })
    );
    const expiry = futureExpiry();
    const item = {
      medicine_id: med.id,
      batch_no: 'CET01',
      expiry_date: expiry,
      quantity: 50,
      mrp: 30,
      purchase_price: 20,
      sale_price: 25,
      gst_rate: 5,
    };

    createPurchase(purchaseInput([item]));
    createPurchase(
      purchaseInput([{ ...item, quantity: 30, sale_price: 26 }])
    );

    const batches = listBatchesByMedicine(med.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity_in_stock).toBe(80);
    expect(batches[0].sale_price).toBe(26);
  });
});
