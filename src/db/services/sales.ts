import { getDb } from '../index';
import { getSettings } from './settings';
import { computeSaleInvoice, saleLineAmounts } from '@shared/gst';
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
              m.manufacturer AS manufacturer, m.pack_size AS pack_size, m.rack AS rack,
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

type BatchRow = {
  id: number;
  medicine_id: number;
  medicine_name: string;
  batch_no: string;
  hsn_code: string | null;
  sale_price: number;
  mrp: number;
  expiry_date: string;
  manufacturer: string | null;
  pack_size: string | null;
  rack: string | null;
  gst_rate: number;
  quantity_in_stock: number;
};

function writeSaleLines(
  db: ReturnType<typeof getDb>,
  saleId: number,
  data: SaleInput
): void {
  if (!data.items.length) throw new Error('Cannot create an empty sale.');

  const getBatch = db.prepare(
    `SELECT b.id, b.medicine_id, b.batch_no, b.expiry_date, b.sale_price, b.mrp,
            b.quantity_in_stock,
            m.name AS medicine_name, m.gst_rate AS gst_rate, m.hsn_code AS hsn_code,
            m.manufacturer AS manufacturer, m.pack_size AS pack_size, m.rack AS rack
     FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.id = ?`
  );
  const decStock = db.prepare(
    'UPDATE batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?'
  );
  const insertItem = db.prepare(
    `INSERT INTO sale_items
      (sale_id, batch_id, medicine_id, medicine_name, batch_no, hsn_code, quantity, free_quantity,
       scheme, price, mrp, expiry_date, manufacturer, pack_size, rack, gst_rate,
       discount_percent, discount, taxable_value, line_total)
     VALUES (@sale_id, @batch_id, @medicine_id, @medicine_name, @batch_no, @hsn_code, @quantity, @free_quantity,
             @scheme, @price, @mrp, @expiry_date, @manufacturer, @pack_size, @rack, @gst_rate,
             @discount_percent, @discount, @taxable_value, @line_total)`
  );

  const resolved: {
    item: (typeof data.items)[number];
    batch: BatchRow;
    unitPrice: number;
    paidQty: number;
    freeQty: number;
    lineGross: number;
    discountPercent: number;
    scheme: string | null;
    hsnCode: string | null;
    mrp: number;
    gstRate: number;
  }[] = [];

  for (const item of data.items) {
    const b = getBatch.get(item.batch_id) as BatchRow | undefined;
    if (!b) throw new Error('Selected batch no longer exists.');
    const paidQty = item.quantity;
    const freeQty = Math.max(0, item.free_quantity ?? 0);
    if (paidQty <= 0) throw new Error('Quantity must be greater than zero.');
    if (freeQty < 0) throw new Error('Free quantity cannot be negative.');
    const stockOut = paidQty + freeQty;
    if (b.quantity_in_stock < stockOut) {
      throw new Error(
        `Not enough stock for ${b.medicine_name} (batch ${b.batch_no}). Available: ${b.quantity_in_stock}.`
      );
    }

    const unitPrice =
      item.price != null && Number.isFinite(item.price) ? Number(item.price) : b.sale_price;
    if (unitPrice < 0) throw new Error(`Rate cannot be negative for ${b.medicine_name}.`);

    const mrp =
      item.mrp != null && Number.isFinite(item.mrp) ? Number(item.mrp) : b.mrp;
    if (mrp < 0) throw new Error(`MRP cannot be negative for ${b.medicine_name}.`);

    const gstRate =
      item.gst_rate != null && Number.isFinite(item.gst_rate)
        ? Math.min(Math.max(0, Number(item.gst_rate)), 100)
        : (b.gst_rate ?? 0);

    const hsnCode =
      item.hsn_code !== undefined
        ? (item.hsn_code ?? '').trim() || null
        : b.hsn_code;

    const discountPercent = Math.min(Math.max(0, item.discount_percent ?? 0), 100);
    const scheme = (item.scheme ?? '').trim() || null;
    resolved.push({
      item,
      batch: b,
      unitPrice,
      paidQty,
      freeQty,
      lineGross: unitPrice * paidQty,
      discountPercent,
      scheme,
      hsnCode,
      mrp,
      gstRate,
    });
  }

  const invoice = computeSaleInvoice(
    resolved.map((row) => ({
      gross: row.lineGross,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
    }))
  );

  resolved.forEach((row) => {
    const lineAmounts = saleLineAmounts({
      gross: row.lineGross,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
    });
    insertItem.run({
      sale_id: saleId,
      batch_id: row.batch.id,
      medicine_id: row.batch.medicine_id,
      medicine_name: row.batch.medicine_name,
      batch_no: row.batch.batch_no,
      hsn_code: row.hsnCode,
      quantity: row.paidQty,
      free_quantity: row.freeQty,
      scheme: row.scheme,
      price: row.unitPrice,
      mrp: row.mrp,
      expiry_date: row.batch.expiry_date,
      manufacturer: row.batch.manufacturer,
      pack_size: row.batch.pack_size,
      rack: row.batch.rack,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
      discount: lineAmounts.discountAmount,
      taxable_value: lineAmounts.taxable,
      line_total: lineAmounts.gross,
    });
    decStock.run(row.paidQty + row.freeQty, row.batch.id);
  });

  db.prepare(
    `UPDATE sales SET
      customer_id = ?,
      subtotal = ?, discount = ?, discount_percent = ?, cgst = ?, sgst = ?, total = ?
     WHERE id = ?`
  ).run(
    data.customer_id ?? null,
    invoice.subtotal,
    invoice.discountAmount,
    0,
    invoice.cgst,
    invoice.sgst,
    invoice.total,
    saleId
  );
}

export function createSale(input: SaleInput): SaleWithItems {
  const db = getDb();
  const tx = db.transaction((data: SaleInput) => {
    const now = new Date();
    const saleDate = now.toISOString();
    const invoiceNo = nextInvoiceNo();

    const saleInfo = db
      .prepare(
        `INSERT INTO sales (invoice_no, customer_id, sale_date, subtotal, discount, discount_percent, cgst, sgst, total)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)`
      )
      .run(invoiceNo, data.customer_id ?? null, saleDate);
    const saleId = Number(saleInfo.lastInsertRowid);
    writeSaleLines(db, saleId, data);
    return saleId;
  });

  const id = tx(input);
  return getSale(id)!;
}

export function updateSale(id: number, input: SaleInput): SaleWithItems {
  const db = getDb();
  const tx = db.transaction((data: SaleInput) => {
    const sale = db.prepare('SELECT id FROM sales WHERE id = ?').get(id) as
      | { id: number }
      | undefined;
    if (!sale) throw new Error('Sale invoice not found.');

    const oldItems = db
      .prepare(
        'SELECT batch_id, quantity, COALESCE(free_quantity, 0) AS free_quantity FROM sale_items WHERE sale_id = ?'
      )
      .all(id) as { batch_id: number | null; quantity: number; free_quantity: number }[];

    const incStock = db.prepare(
      'UPDATE batches SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?'
    );
    for (const old of oldItems) {
      if (old.batch_id != null) {
        incStock.run(old.quantity + (old.free_quantity ?? 0), old.batch_id);
      }
    }

    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
    writeSaleLines(db, id, data);
  });

  tx(input);
  return getSale(id)!;
}

function normalizeSaleItem(it: SaleItem): SaleItem {
  return {
    ...it,
    discount_percent: it.discount_percent ?? 0,
    taxable_value: it.taxable_value ?? 0,
    free_quantity: it.free_quantity ?? 0,
    scheme: it.scheme ?? null,
    mrp: it.mrp ?? 0,
    expiry_date: it.expiry_date ?? null,
    manufacturer: it.manufacturer ?? null,
    pack_size: it.pack_size ?? null,
    rack: it.rack ?? null,
  };
}

export function getSale(id: number): SaleWithItems | null {
  const db = getDb();
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as Sale | undefined;
  if (!sale) return null;
  const items = (
    db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id) as SaleItem[]
  ).map(normalizeSaleItem);
  const customer = sale.customer_id
    ? (db
        .prepare('SELECT name, phone, address, gstin FROM customers WHERE id = ?')
        .get(sale.customer_id) as
        | {
            name: string;
            phone: string | null;
            address: string | null;
            gstin: string | null;
          }
        | undefined)
    : undefined;
  return {
    ...sale,
    discount_percent: sale.discount_percent ?? 0,
    items,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_address: customer?.address ?? null,
    customer_gstin: customer?.gstin ?? null,
  };
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
