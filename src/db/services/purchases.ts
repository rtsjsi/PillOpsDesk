import { getDb } from '../index';
import { normalizeExpiryDate } from '@shared/expiry';
import { purchaseLandingCost, purchaseLineAmounts } from '@shared/gst';
import type {
  Purchase,
  PurchaseInput,
  PurchaseItem,
  PurchaseItemInput,
  PurchaseWithItems,
} from '@shared/types';

function lineAmounts(it: PurchaseItemInput) {
  return purchaseLineAmounts({
    purchase_price: it.purchase_price,
    discount_percent: it.discount_percent,
    quantity: it.quantity,
    gst_rate: it.gst_rate,
  });
}

function stockQty(it: PurchaseItemInput): number {
  return it.quantity + Math.max(0, it.free_quantity ?? 0);
}

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
      (purchase_id, batch_id, medicine_id, quantity, free_quantity, purchase_price,
       discount_percent, gst_rate, taxable_value, line_total)
     VALUES (@purchase_id, @batch_id, @medicine_id, @quantity, @free_quantity,
             @purchase_price, @discount_percent, @gst_rate, @taxable_value, @line_total)`
  );

  for (const it of items) {
    const amounts = lineAmounts(it);
    const landing = purchaseLandingCost(it);
    const qtyIn = stockQty(it);
    const expiryDate = normalizeExpiryDate(it.expiry_date);
    const existing = findBatch.get(it.medicine_id, it.batch_no, expiryDate) as
      | { id: number }
      | undefined;
    let batchId: number;
    if (existing) {
      updateBatch.run({
        id: existing.id,
        qty: qtyIn,
        mrp: it.mrp,
        purchase_price: landing,
        sale_price: it.sale_price,
      });
      batchId = existing.id;
    } else {
      const bInfo = insertBatch.run({
        medicine_id: it.medicine_id,
        batch_no: it.batch_no,
        expiry_date: expiryDate,
        mrp: it.mrp,
        purchase_price: landing,
        sale_price: it.sale_price,
        quantity_in_stock: qtyIn,
      });
      batchId = Number(bInfo.lastInsertRowid);
    }
    insertItem.run({
      purchase_id: purchaseId,
      batch_id: batchId,
      medicine_id: it.medicine_id,
      quantity: it.quantity,
      free_quantity: Math.max(0, it.free_quantity ?? 0),
      purchase_price: it.purchase_price,
      discount_percent: Math.min(Math.max(0, it.discount_percent ?? 0), 100),
      gst_rate: it.gst_rate,
      taxable_value: amounts.taxable_value,
      line_total: amounts.line_total,
    });
  }
}

function purchaseTotal(items: PurchaseItemInput[]): number {
  return items.reduce((sum, it) => sum + lineAmounts(it).line_total, 0);
}

export function createPurchase(input: PurchaseInput): Purchase {
  const db = getDb();
  if (!input.items.length) throw new Error('Add at least one item.');

  const tx = db.transaction((data: PurchaseInput) => {
    const total = purchaseTotal(data.items);
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
              pi.purchase_price, pi.discount_percent, pi.free_quantity,
              pi.gst_rate, pi.quantity, pi.taxable_value, pi.line_total
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
        `SELECT pi.batch_id, pi.quantity, pi.free_quantity,
                m.name AS medicine_name, b.batch_no
         FROM purchase_items pi
         JOIN medicines m ON m.id = pi.medicine_id
         JOIN batches b ON b.id = pi.batch_id
         WHERE pi.purchase_id = ?`
      )
      .all(id) as {
      batch_id: number;
      quantity: number;
      free_quantity: number;
      medicine_name: string;
      batch_no: string;
    }[];

    const getStock = db.prepare('SELECT quantity_in_stock FROM batches WHERE id = ?');
    const decStock = db.prepare(
      'UPDATE batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?'
    );

    for (const old of oldItems) {
      const stockOut = old.quantity + Math.max(0, old.free_quantity ?? 0);
      const row = getStock.get(old.batch_id) as { quantity_in_stock: number } | undefined;
      if (!row) throw new Error(`Batch for ${old.medicine_name} no longer exists.`);
      if (row.quantity_in_stock < stockOut) {
        throw new Error(
          `Cannot edit this purchase — ${old.medicine_name} (batch ${old.batch_no}) has already been sold. Available stock: ${row.quantity_in_stock}, purchase qty: ${stockOut}.`
        );
      }
      decStock.run(stockOut, old.batch_id);
    }

    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);

    const total = purchaseTotal(data.items);
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
