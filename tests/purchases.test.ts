import { describe, expect, it } from 'vitest';
import { listBatchesByMedicine } from '../src/db/services/batches';
import { createMedicine } from '../src/db/services/medicines';
import { createSupplier } from '../src/db/services/parties';
import {
  createPurchase,
  getPurchase,
  listPurchases,
  updatePurchase,
} from '../src/db/services/purchases';
import { createSale } from '../src/db/services/sales';
import { futureExpiry, medicineInput, purchaseInput, saleInput } from './helpers/fixtures';

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

  it('gets purchase with joined items and supplier name', () => {
    const med = createMedicine(medicineInput({ name: 'View Med', gst_rate: 12 }));
    const supplier = createSupplier({
      name: 'View Supplier',
      phone: '',
      address: '',
      gstin: '',
    });
    const expiry = futureExpiry();
    const created = createPurchase(
      purchaseInput(
        [
          {
            medicine_id: med.id,
            batch_no: 'VM01',
            expiry_date: expiry,
            quantity: 10,
            mrp: 50,
            purchase_price: 40,
            sale_price: 45,
            gst_rate: 12,
          },
        ],
        { supplier_id: supplier.id, invoice_no: 'PO-VIEW' }
      )
    );

    const loaded = getPurchase(created.id)!;
    expect(loaded.supplier_name).toBe('View Supplier');
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0].medicine_name).toBe('View Med');
    expect(loaded.items[0].batch_no).toBe('VM01');
    expect(loaded.items[0].quantity).toBe(10);
  });

  it('updates purchase quantity and adjusts stock', () => {
    const med = createMedicine(medicineInput({ name: 'Edit Med', gst_rate: 12 }));
    const expiry = futureExpiry();
    const item = {
      medicine_id: med.id,
      batch_no: 'ED01',
      expiry_date: expiry,
      quantity: 50,
      mrp: 100,
      purchase_price: 80,
      sale_price: 90,
      gst_rate: 12,
    };
    const created = createPurchase(
      purchaseInput([item], { invoice_no: 'PO-EDIT' })
    );

    const updated = updatePurchase(
      created.id,
      purchaseInput([{ ...item, quantity: 30 }], { invoice_no: 'PO-EDIT-2' })
    );

    expect(updated.invoice_no).toBe('PO-EDIT-2');
    expect(updated.total_amount).toBe(2400);
    expect(updated.items[0].quantity).toBe(30);
    expect(listBatchesByMedicine(med.id)[0].quantity_in_stock).toBe(30);
  });

  it('rejects purchase update when stock was already sold', () => {
    const med = createMedicine(medicineInput({ name: 'Sold Med', gst_rate: 12 }));
    const expiry = futureExpiry();
    const item = {
      medicine_id: med.id,
      batch_no: 'SL01',
      expiry_date: expiry,
      quantity: 10,
      mrp: 100,
      purchase_price: 80,
      sale_price: 90,
      gst_rate: 12,
    };
    const created = createPurchase(purchaseInput([item]));
    const batch = listBatchesByMedicine(med.id)[0];
    createSale(saleInput([{ batch_id: batch.id, quantity: 8 }]));

    expect(() =>
      updatePurchase(
        created.id,
        purchaseInput([{ ...item, quantity: 5 }])
      )
    ).toThrow(/already been sold/);

    expect(listBatchesByMedicine(med.id)[0].quantity_in_stock).toBe(2);
    expect(getPurchase(created.id)?.items[0].quantity).toBe(10);
  });
});
