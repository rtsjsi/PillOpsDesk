import { describe, expect, it } from 'vitest';
import { createBatch } from '../src/db/services/batches';
import {
  createMedicine,
  listMedicines,
  removeMedicine,
} from '../src/db/services/medicines';
import { searchSellable } from '../src/db/services/sales';
import { futureExpiry, medicineInput, seedMedicineWithBatch } from './helpers/fixtures';

describe('medicines', () => {
  it('lists active medicines only after soft delete', () => {
    const med = createMedicine(
      medicineInput({ name: 'Ibuprofen', gst_rate: 12, reorder_level: 5 })
    );
    expect(listMedicines()).toHaveLength(1);

    removeMedicine(med.id);
    expect(listMedicines()).toHaveLength(0);
    expect(listMedicines('Ibuprofen')).toHaveLength(0);
  });

  it('excludes soft-deleted medicine from sellable search', () => {
    const { med, batch } = seedMedicineWithBatch({ name: 'Hidden Med' });
    removeMedicine(med.id);
    const results = searchSellable('Hidden');
    expect(results.find((r) => r.batch_id === batch.id)).toBeUndefined();
  });

  it('filters medicines by search term', () => {
    createMedicine(
      medicineInput({
        name: 'Aspirin',
        generic_name: 'Acetylsalicylic',
        gst_rate: 12,
        reorder_level: 5,
      })
    );
    createMedicine(
      medicineInput({ name: 'Azithromycin', gst_rate: 12, reorder_level: 5 })
    );
    expect(listMedicines('asp')).toHaveLength(1);
    expect(listMedicines('azi')).toHaveLength(1);
  });

  it('persists pack size, schedule, storage type, dosage form, and category', () => {
    const med = createMedicine(
      medicineInput({
        name: 'Insulin Glargine',
        dosage_form: 'Injection',
        category: 'Anti-Diabetic',
        pack_size: '3ml',
        schedule: 'H1',
        storage_type: 'refrigerated',
      })
    );
    expect(med.dosage_form).toBe('Injection');
    expect(med.category).toBe('Anti-Diabetic');
    expect(med.pack_size).toBe('3ml');
    expect(med.schedule).toBe('H1');
    expect(med.storage_type).toBe('refrigerated');
  });
});

describe('batch stock', () => {
  it('tracks quantity independently per batch of the same medicine', () => {
    const med = createMedicine(
      medicineInput({ name: 'Multi Batch Med', gst_rate: 12, reorder_level: 100 })
    );
    createBatch({
      medicine_id: med.id,
      batch_no: 'MB1',
      expiry_date: futureExpiry(2),
      mrp: 100,
      purchase_price: 80,
      sale_price: 100,
      quantity_in_stock: 10,
    });
    createBatch({
      medicine_id: med.id,
      batch_no: 'MB2',
      expiry_date: futureExpiry(3),
      mrp: 100,
      purchase_price: 80,
      sale_price: 100,
      quantity_in_stock: 15,
    });
    const results = searchSellable('Multi Batch');
    expect(results).toHaveLength(2);
    expect(results.reduce((sum, r) => sum + r.quantity_in_stock, 0)).toBe(25);
  });
});
