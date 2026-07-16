import { getDb } from '../index';
import type { Batch, BatchInput, StockRow } from '@shared/types';

export function listBatchesByMedicine(medicineId: number): Batch[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry_date')
    .all(medicineId) as Batch[];
}

export function createBatch(input: BatchInput): Batch {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO batches
        (medicine_id, batch_no, expiry_date, mrp, purchase_price, sale_price, quantity_in_stock)
       VALUES (@medicine_id, @batch_no, @expiry_date, @mrp, @purchase_price, @sale_price, @quantity_in_stock)`
    )
    .run(input);
  return db
    .prepare('SELECT * FROM batches WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Batch;
}

export function updateBatch(id: number, input: BatchInput): Batch {
  const db = getDb();
  db.prepare(
    `UPDATE batches SET
      batch_no = @batch_no, expiry_date = @expiry_date, mrp = @mrp,
      purchase_price = @purchase_price, sale_price = @sale_price,
      quantity_in_stock = @quantity_in_stock
     WHERE id = @id`
  ).run({ ...input, id });
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as Batch;
}

export function removeBatch(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM batches WHERE id = ?').run(id);
}

export function listStock(search?: string): StockRow[] {
  const db = getDb();
  const base = `
    SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.reorder_level AS reorder_level
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id
    WHERE m.is_active = 1`;
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(`${base} AND (m.name LIKE ? OR b.batch_no LIKE ?) ORDER BY m.name, b.expiry_date`)
      .all(q, q) as StockRow[];
  }
  return db.prepare(`${base} ORDER BY m.name, b.expiry_date`).all() as StockRow[];
}
