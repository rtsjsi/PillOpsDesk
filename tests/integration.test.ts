import { describe, expect, it } from 'vitest';
import { createBatch, listBatchesByMedicine } from '../src/db/services/batches';
import { createMedicine } from '../src/db/services/medicines';
import { getDashboard } from '../src/db/services/reports';
import { createCustomer, createSupplier } from '../src/db/services/parties';
import { createPurchase } from '../src/db/services/purchases';
import { createSale, listSales } from '../src/db/services/sales';
import { futureExpiry, medicineInput, purchaseInput, saleInput } from './helpers/fixtures';

describe('integration: purchase → sale → reports', () => {
  it('runs the core day-to-day pharmacy flow', () => {
    const supplier = createSupplier({
      name: 'Wholesale Hub',
      phone: '9000000000',
      address: 'Industrial Area',
      gstin: '29AAAAA0000A1Z5',
    });
    const customer = createCustomer({
      name: 'Walk-in Regular',
      phone: '9888888888',
      address: '',
    });

    const med = createMedicine(
      medicineInput({
        name: 'Dolo 650',
        generic_name: 'Paracetamol',
        gst_rate: 12,
        reorder_level: 20,
      })
    );

    createPurchase(
      purchaseInput(
        [
          {
            medicine_id: med.id,
            batch_no: 'DL650-A',
            expiry_date: futureExpiry(),
            quantity: 200,
            mrp: 35,
            purchase_price: 22,
            sale_price: 30,
            gst_rate: 12,
          },
        ],
        {
          supplier_id: supplier.id,
          invoice_no: 'WH-001',
          notes: 'Monthly restock',
        }
      )
    );

    const batchB = createBatch({
      medicine_id: med.id,
      batch_no: 'DL650-B',
      expiry_date: futureExpiry(2),
      mrp: 35,
      purchase_price: 22,
      sale_price: 30,
      quantity_in_stock: 50,
    });

    const batches = listBatchesByMedicine(med.id);
    expect(batches).toHaveLength(2);
    const batchA = batches.find((b) => b.batch_no === 'DL650-A')!;

    const sale = createSale(
      saleInput(
        [
          { batch_id: batchA.id, quantity: 10 },
          { batch_id: batchB.id, quantity: 5 },
        ],
        { customer_id: customer.id, discount_percent: 5 }
      )
    );

    expect(sale.invoice_no).toBe('INV-00001');
    expect(sale.customer_name).toBe('Walk-in Regular');
    expect(sale.items).toHaveLength(2);
    expect(sale.discount_percent).toBe(5);
    expect(sale.total).toBeGreaterThan(0);

    expect(listBatchesByMedicine(med.id).find((b) => b.batch_no === 'DL650-A')!.quantity_in_stock).toBe(190);
    expect(listBatchesByMedicine(med.id).find((b) => b.batch_no === 'DL650-B')!.quantity_in_stock).toBe(45);

    const today = new Date().toISOString().slice(0, 10);
    const history = listSales(today, today);
    expect(history).toHaveLength(1);
    expect(history[0].total).toBe(sale.total);

    const dashboard = getDashboard();
    expect(dashboard.todayInvoiceCount).toBe(1);
    expect(dashboard.todaySalesTotal).toBe(sale.total);
    expect(dashboard.totalMedicines).toBe(1);
  });
});
