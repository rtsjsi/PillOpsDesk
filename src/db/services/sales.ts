import { getDb } from '../index';
import { getSettings } from './settings';
import type {
  SaleInput,
  SaleWithItems,
  SellableBatch,
  SaleItem,
  Sale,
} from '@shared/types';

export function searchSellable(search: string): SellableBatch[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const q = `%${(search ?? '').trim()}%`;
  return db
    .prepare(
      `SELECT b.id AS batch_id, m.id AS medicine_id, m.name AS name,
              b.batch_no, b.expiry_date, b.sale_price, b.mrp,
              m.gst_rate AS gst_rate, m.hsn_code AS hsn_code,
              b.quantity_in_stock
       FROM batches b
       JOIN medicines m ON m.id = b.medicine_id
       WHERE m.is_active = 1 AND b.quantity_in_stock > 0 AND b.expiry_date >= ?
         AND (m.name LIKE ? OR b.batch_no LIKE ? OR m.generic_name LIKE ?)
       ORDER BY m.name, b.expiry_date
       LIMIT 50`
    )
    .all(today, q, q, q) as SellableBatch[];
}

function nextInvoiceNo(): string {
  const db = getDb();
  const settings = getSettings();
  db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run('invoice');
  const row = db.prepare('SELECT value FROM counters WHERE key = ?').get('invoice') as {
    value: number;
  };
  const seq = String(row.value).padStart(5, '0');
  return `${settings.invoice_prefix || 'INV'}-${seq}`;
}

export function createSale(input: SaleInput): SaleWithItems {
  const db = getDb();
  const tx = db.transaction((data: SaleInput) => {
    if (!data.items.length) throw new Error('Cannot create an empty sale.');

    const now = new Date();
    const saleDate = now.toISOString();
    const invoiceNo = nextInvoiceNo();

    let subtotal = 0; // taxable value
    let cgst = 0;
    let sgst = 0;
    let grossTotal = 0;

    const getBatch = db.prepare(
      `SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.hsn_code AS hsn_code
       FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.id = ?`
    );
    const decStock = db.prepare(
      'UPDATE batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?'
    );

    const saleInfo = db
      .prepare(
        `INSERT INTO sales (invoice_no, customer_id, sale_date, subtotal, discount, cgst, sgst, total)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0)`
      )
      .run(invoiceNo, data.customer_id ?? null, saleDate);
    const saleId = Number(saleInfo.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO sale_items
        (sale_id, batch_id, medicine_id, medicine_name, batch_no, hsn_code, quantity, price, gst_rate, discount, line_total)
       VALUES (@sale_id, @batch_id, @medicine_id, @medicine_name, @batch_no, @hsn_code, @quantity, @price, @gst_rate, @discount, @line_total)`
    );

    for (const item of data.items) {
      const b = getBatch.get(item.batch_id) as
        | {
            id: number;
            medicine_id: number;
            medicine_name: string;
            batch_no: string;
            hsn_code: string | null;
            sale_price: number;
            gst_rate: number;
            quantity_in_stock: number;
          }
        | undefined;
      if (!b) throw new Error('Selected batch no longer exists.');
      if (item.quantity <= 0) throw new Error('Quantity must be greater than zero.');
      if (b.quantity_in_stock < item.quantity) {
        throw new Error(
          `Not enough stock for ${b.medicine_name} (batch ${b.batch_no}). Available: ${b.quantity_in_stock}.`
        );
      }

      const gross = b.sale_price * item.quantity - (item.discount ?? 0);
      const rate = b.gst_rate ?? 0;
      const taxable = rate > 0 ? gross / (1 + rate / 100) : gross;
      const tax = gross - taxable;

      subtotal += taxable;
      cgst += tax / 2;
      sgst += tax / 2;
      grossTotal += gross;

      insertItem.run({
        sale_id: saleId,
        batch_id: b.id,
        medicine_id: b.medicine_id,
        medicine_name: b.medicine_name,
        batch_no: b.batch_no,
        hsn_code: b.hsn_code,
        quantity: item.quantity,
        price: b.sale_price,
        gst_rate: rate,
        discount: item.discount ?? 0,
        line_total: round2(gross),
      });

      decStock.run(item.quantity, b.id);
    }

    const overallDiscount = data.overall_discount ?? 0;
    const total = round2(grossTotal - overallDiscount);

    db.prepare(
      `UPDATE sales SET subtotal = ?, discount = ?, cgst = ?, sgst = ?, total = ? WHERE id = ?`
    ).run(
      round2(subtotal),
      round2(overallDiscount),
      round2(cgst),
      round2(sgst),
      total,
      saleId
    );

    return saleId;
  });

  const id = tx(input);
  return getSale(id)!;
}

export function getSale(id: number): SaleWithItems | null {
  const db = getDb();
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as Sale | undefined;
  if (!sale) return null;
  const items = db
    .prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id')
    .all(id) as SaleItem[];
  const customer = sale.customer_id
    ? (db.prepare('SELECT name FROM customers WHERE id = ?').get(sale.customer_id) as
        | { name: string }
        | undefined)
    : undefined;
  return { ...sale, items, customer_name: customer?.name ?? null };
}

export function listSales(from?: string, to?: string): SaleWithItems[] {
  const db = getDb();
  let rows: Sale[];
  if (from && to) {
    rows = db
      .prepare(
        `SELECT * FROM sales WHERE date(sale_date) BETWEEN ? AND ?
         ORDER BY sale_date DESC, id DESC LIMIT 500`
      )
      .all(from, to) as Sale[];
  } else {
    rows = db
      .prepare('SELECT * FROM sales ORDER BY sale_date DESC, id DESC LIMIT 200')
      .all() as Sale[];
  }
  return rows.map((r) => getSale(r.id)!);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
