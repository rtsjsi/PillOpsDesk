import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index';
import { listBatchesByMedicine } from '../src/db/services/batches';
import { createCustomer } from '../src/db/services/parties';
import {
  createSale,
  getSale,
  searchSellable,
  updateSale,
} from '../src/db/services/sales';
import { saveSettings } from '../src/db/services/settings';
import { futureExpiry, pastExpiry, saleInput, seedMedicineWithBatch } from './helpers/fixtures';

describe('sales', () => {
  it('creates a sale and decrements batch stock', () => {
    const { batch } = seedMedicineWithBatch({ quantity: 20, sale_price: 50 });
    const sale = createSale(
      saleInput([{ batch_id: batch.id, quantity: 3 }])
    );

    expect(sale.invoice_no).toBe('INV-00001');
    expect(sale.total).toBe(150);
    expect(sale.items).toHaveLength(1);

    const updated = listBatchesByMedicine(batch.medicine_id)[0];
    expect(updated.quantity_in_stock).toBe(17);
  });

  it('uses custom invoice prefix from settings', () => {
    saveSettings({
      store_name: 'Test Store',
      address: '',
      phone: '',
      gstin: '',
      dl_no: '',
      invoice_prefix: 'PHM',
      expiry_alert_days: 90,
    });
    const { batch } = seedMedicineWithBatch();
    const sale = createSale(
      saleInput([{ batch_id: batch.id, quantity: 1 }])
    );
    expect(sale.invoice_no).toBe('PHM-00001');
  });

  it('increments invoice sequence across sales', () => {
    const { batch } = seedMedicineWithBatch();
    const first = createSale(
      saleInput([{ batch_id: batch.id, quantity: 1 }])
    );
    const second = createSale(
      saleInput([{ batch_id: batch.id, quantity: 1 }])
    );
    expect(first.invoice_no).toBe('INV-00001');
    expect(second.invoice_no).toBe('INV-00002');
  });

  it('applies invoice discount to totals', () => {
    const { batch } = seedMedicineWithBatch({ sale_price: 112, gst_rate: 12 });
    const sale = createSale(
      saleInput([{ batch_id: batch.id, quantity: 1 }], { discount_percent: 10 })
    );
    expect(sale.discount_percent).toBe(10);
    expect(sale.discount).toBe(11.2);
    expect(sale.total).toBe(100.8);
    expect(sale.subtotal).toBe(90);
  });

  it('links customer to sale', () => {
    const { batch } = seedMedicineWithBatch();
    const customer = createCustomer({
      name: 'Ramesh Kumar',
      phone: '9876543210',
      address: 'Main Road',
    });
    const sale = createSale(
      saleInput([{ batch_id: batch.id, quantity: 1 }], {
        customer_id: customer.id,
      })
    );
    expect(sale.customer_name).toBe('Ramesh Kumar');
    expect(getSale(sale.id)?.customer_name).toBe('Ramesh Kumar');
  });

  it('rejects overselling', () => {
    const { batch } = seedMedicineWithBatch({ quantity: 2 });
    expect(() =>
      createSale(saleInput([{ batch_id: batch.id, quantity: 5 }]))
    ).toThrow(/Not enough stock/);
  });

  it('rejects empty sale', () => {
    expect(() => createSale(saleInput([]))).toThrow(/empty sale/);
  });

  it('rejects non-existent batch', () => {
    expect(() =>
      createSale(saleInput([{ batch_id: 9999, quantity: 1 }]))
    ).toThrow(/no longer exists/);
  });

  it('searchSellable excludes expired batches', () => {
    seedMedicineWithBatch({
      name: 'Expired Med',
      expiry_date: pastExpiry(),
      batch_no: 'EXP01',
    });
    seedMedicineWithBatch({
      name: 'Fresh Med',
      expiry_date: futureExpiry(),
      batch_no: 'FR01',
    });
    const results = searchSellable('Med');
    expect(results.some((r) => r.name === 'Expired Med')).toBe(false);
    expect(results.some((r) => r.name === 'Fresh Med')).toBe(true);
  });

  it('searchSellable excludes zero stock', () => {
    const { batch } = seedMedicineWithBatch({ quantity: 1, name: 'Low Stock Med' });
    createSale(saleInput([{ batch_id: batch.id, quantity: 1 }]));
    const results = searchSellable('Low Stock');
    expect(results).toHaveLength(0);
  });

  it('rolls back stock when transaction fails mid-sale', () => {
    const a = seedMedicineWithBatch({ name: 'Med A', batch_no: 'A1', quantity: 5 });
    const b = seedMedicineWithBatch({ name: 'Med B', batch_no: 'B1', quantity: 1 });

    expect(() =>
      createSale(
        saleInput([
          { batch_id: a.batch.id, quantity: 2 },
          { batch_id: b.batch.id, quantity: 5 },
        ])
      )
    ).toThrow(/Not enough stock/);

    expect(listBatchesByMedicine(a.batch.medicine_id)[0].quantity_in_stock).toBe(5);
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM sales').get()).toMatchObject({
      c: 0,
    });
  });

  it('updates a sale keeping invoice number and adjusting stock', () => {
    const { batch } = seedMedicineWithBatch({ quantity: 20, sale_price: 50 });
    const sale = createSale(saleInput([{ batch_id: batch.id, quantity: 5 }]));
    expect(sale.invoice_no).toBe('INV-00001');
    expect(listBatchesByMedicine(batch.medicine_id)[0].quantity_in_stock).toBe(15);

    const updated = updateSale(
      sale.id,
      saleInput([{ batch_id: batch.id, quantity: 2 }])
    );

    expect(updated.invoice_no).toBe('INV-00001');
    expect(updated.total).toBe(100);
    expect(updated.items[0].quantity).toBe(2);
    expect(listBatchesByMedicine(batch.medicine_id)[0].quantity_in_stock).toBe(18);
  });

  it('rejects sale update when new qty exceeds available stock', () => {
    const { batch } = seedMedicineWithBatch({ quantity: 5, sale_price: 50 });
    const sale = createSale(saleInput([{ batch_id: batch.id, quantity: 3 }]));

    expect(() =>
      updateSale(sale.id, saleInput([{ batch_id: batch.id, quantity: 10 }]))
    ).toThrow(/Not enough stock/);

    expect(getSale(sale.id)?.items[0].quantity).toBe(3);
    expect(listBatchesByMedicine(batch.medicine_id)[0].quantity_in_stock).toBe(2);
  });
});
