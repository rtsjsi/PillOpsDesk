import { getDb } from '../index';
import type { Purchase, PurchaseInput } from '@shared/types';

export function createPurchase(input: PurchaseInput): Purchase {
  const db = getDb();
  const tx = db.transaction((data: PurchaseInput) => {
    const total = data.items.reduce(
      (sum, it) => sum + it.purchase_price * it.quantity,
      0
    );
    const purchaseInfo = db
      .prepare(
        `INSERT INTO purchases (supplier_id, invoice_no, purchase_date, total_amount, notes)
         VALUES (@supplier_id, @invoice_no, @purchase_date, @total_amount, @notes)`
      )
      .run({
        supplier_id: data.supplier_id ?? null,
        invoice_no: data.invoice_no ?? null,
        purchase_date: data.purchase_date,
        total_amount: total,
        notes: data.notes ?? null,
      });
    const purchaseId = Number(purchaseInfo.lastInsertRowid);

    const findBatch = db.prepare(
      'SELECT id FROM batches WHERE medicine_id = ? AND batch_no = ? AND expiry_date = ?'
    );
    const insertBatch = db.prepare(
      `INSERT INTO batches
        (medicine_id, batch_no, expiry_date, mrp, purchase_price, sale_price, quantity_in_stock)
       VALUES (@medicine_id, @batch_no, @expiry_date, @mrp, @purchase_price, @sale_price, @quantity_in_stock)`
    );
    const updateBatch = db.prepare(
      `UPDATE batches SET
        quantity_in_stock = quantity_in_stock + @qty,
        mrp = @mrp, purchase_price = @purchase_price, sale_price = @sale_price
       WHERE id = @id`
    );
    const insertItem = db.prepare(
      `INSERT INTO purchase_items
        (purchase_id, batch_id, medicine_id, quantity, purchase_price, gst_rate)
       VALUES (@purchase_id, @batch_id, @medicine_id, @quantity, @purchase_price, @gst_rate)`
    );

    for (const it of data.items) {
      const existing = findBatch.get(it.medicine_id, it.batch_no, it.expiry_date) as
        | { id: number }
        | undefined;
      let batchId: number;
      if (existing) {
        updateBatch.run({
          id: existing.id,
          qty: it.quantity,
          mrp: it.mrp,
          purchase_price: it.purchase_price,
          sale_price: it.sale_price,
        });
        batchId = existing.id;
      } else {
        const bInfo = insertBatch.run({
          medicine_id: it.medicine_id,
          batch_no: it.batch_no,
          expiry_date: it.expiry_date,
          mrp: it.mrp,
          purchase_price: it.purchase_price,
          sale_price: it.sale_price,
          quantity_in_stock: it.quantity,
        });
        batchId = Number(bInfo.lastInsertRowid);
      }
      insertItem.run({
        purchase_id: purchaseId,
        batch_id: batchId,
        medicine_id: it.medicine_id,
        quantity: it.quantity,
        purchase_price: it.purchase_price,
        gst_rate: it.gst_rate,
      });
    }
    return purchaseId;
  });

  const id = tx(input);
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(id) as Purchase;
}

export function listPurchases(search?: string): Purchase[] {
  const db = getDb();
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .prepare(
        `SELECT p.* FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.invoice_no LIKE ? OR s.name LIKE ?
         ORDER BY p.purchase_date DESC, p.id DESC LIMIT 200`
      )
      .all(q, q) as Purchase[];
  }
  return db
    .prepare('SELECT * FROM purchases ORDER BY purchase_date DESC, id DESC LIMIT 200')
    .all() as Purchase[];
}
