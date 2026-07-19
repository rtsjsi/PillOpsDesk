import { getDb } from '../index';
import type {
  Purchase,
  PurchaseInput,
  PurchaseItem,
  PurchaseItemInput,
  PurchaseWithItems,
} from '@shared/types';

function applyPurchaseItems(
  db: ReturnType<typeof getDb>,
  purchaseId: number,
  items: PurchaseItemInput[]
): void {
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

  for (const it of items) {
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
}

export function createPurchase(input: PurchaseInput): Purchase {
  const db = getDb();
  if (!input.items.length) throw new Error('Add at least one item.');

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
    applyPurchaseItems(db, purchaseId, data.items);
    return purchaseId;
  });

  const id = tx(input);
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(id) as Purchase;
}

export function getPurchase(id: number): PurchaseWithItems | null {
  const db = getDb();
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id) as
    | Purchase
    | undefined;
  if (!purchase) return null;

  const items = db
    .prepare(
      `SELECT pi.id, pi.purchase_id, pi.batch_id, pi.medicine_id,
              m.name AS medicine_name,
              b.batch_no, b.expiry_date, b.mrp, b.sale_price,
              pi.purchase_price, pi.gst_rate, pi.quantity
       FROM purchase_items pi
       JOIN medicines m ON m.id = pi.medicine_id
       JOIN batches b ON b.id = pi.batch_id
       WHERE pi.purchase_id = ?
       ORDER BY pi.id`
    )
    .all(id) as PurchaseItem[];

  const supplier = purchase.supplier_id
    ? (db.prepare('SELECT name FROM suppliers WHERE id = ?').get(purchase.supplier_id) as
        | { name: string }
        | undefined)
    : undefined;

  return {
    ...purchase,
    items,
    supplier_name: supplier?.name ?? null,
  };
}

export function updatePurchase(id: number, input: PurchaseInput): PurchaseWithItems {
  const db = getDb();
  if (!input.items.length) throw new Error('Add at least one item.');

  const tx = db.transaction((data: PurchaseInput) => {
    const existing = db.prepare('SELECT id FROM purchases WHERE id = ?').get(id) as
      | { id: number }
      | undefined;
    if (!existing) throw new Error('Purchase invoice not found.');

    const oldItems = db
      .prepare(
        `SELECT pi.batch_id, pi.quantity, m.name AS medicine_name, b.batch_no
         FROM purchase_items pi
         JOIN medicines m ON m.id = pi.medicine_id
         JOIN batches b ON b.id = pi.batch_id
         WHERE pi.purchase_id = ?`
      )
      .all(id) as {
      batch_id: number;
      quantity: number;
      medicine_name: string;
      batch_no: string;
    }[];

    const getStock = db.prepare('SELECT quantity_in_stock FROM batches WHERE id = ?');
    const decStock = db.prepare(
      'UPDATE batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?'
    );

    for (const old of oldItems) {
      const row = getStock.get(old.batch_id) as { quantity_in_stock: number } | undefined;
      if (!row) throw new Error(`Batch for ${old.medicine_name} no longer exists.`);
      if (row.quantity_in_stock < old.quantity) {
        throw new Error(
          `Cannot edit this purchase — ${old.medicine_name} (batch ${old.batch_no}) has already been sold. Available stock: ${row.quantity_in_stock}, purchase qty: ${old.quantity}.`
        );
      }
      decStock.run(old.quantity, old.batch_id);
    }

    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);

    const total = data.items.reduce(
      (sum, it) => sum + it.purchase_price * it.quantity,
      0
    );
    db.prepare(
      `UPDATE purchases SET
        supplier_id = @supplier_id,
        invoice_no = @invoice_no,
        purchase_date = @purchase_date,
        total_amount = @total_amount,
        notes = @notes
       WHERE id = @id`
    ).run({
      id,
      supplier_id: data.supplier_id ?? null,
      invoice_no: data.invoice_no ?? null,
      purchase_date: data.purchase_date,
      total_amount: total,
      notes: data.notes ?? null,
    });

    applyPurchaseItems(db, id, data.items);
  });

  tx(input);
  return getPurchase(id)!;
}

export function listPurchases(from?: string, to?: string): Purchase[] {
  const db = getDb();
  if (from && to) {
    return db
      .prepare(
        `SELECT * FROM purchases
         WHERE date(purchase_date) BETWEEN ? AND ?
         ORDER BY purchase_date DESC, id DESC LIMIT 500`
      )
      .all(from, to) as Purchase[];
  }
  return db
    .prepare('SELECT * FROM purchases ORDER BY purchase_date DESC, id DESC LIMIT 200')
    .all() as Purchase[];
}
