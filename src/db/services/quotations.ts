import { getDb } from '../index';
import { getSettings } from './settings';
import { computeSaleInvoice, saleLineAmounts } from '@shared/gst';
import type {
  Quotation,
  QuotationInput,
  QuotationItem,
  QuotationWithItems,
} from '@shared/types';

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function nextQuotationNo(): string {
  const db = getDb();
  const settings = getSettings();
  db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run('quotation');
  const row = db.prepare('SELECT value FROM counters WHERE key = ?').get('quotation') as {
    value: number;
  };
  const seq = String(row.value).padStart(5, '0');
  return `${settings.quotation_prefix || 'QT'}-${seq}`;
}

function customerLookup(customerId: number | null) {
  if (!customerId) return undefined;
  return getDb()
    .prepare('SELECT name, phone, address, gstin, pan, dl_no FROM customers WHERE id = ?')
    .get(customerId) as
    | {
        name: string;
        phone: string | null;
        address: string | null;
        gstin: string | null;
        pan: string | null;
        dl_no: string | null;
      }
    | undefined;
}

function withCustomer(
  quotation: Quotation,
  items: QuotationItem[]
): QuotationWithItems {
  const customer = customerLookup(quotation.customer_id);
  return {
    ...quotation,
    discount_percent: quotation.discount_percent ?? 0,
    items,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_address: customer?.address ?? null,
    customer_gstin: customer?.gstin ?? null,
    customer_pan: customer?.pan ?? null,
    customer_dl_no: customer?.dl_no ?? null,
  };
}

function normalizeItem(it: QuotationItem): QuotationItem {
  return {
    ...it,
    manufacturer: it.manufacturer ?? null,
    pack_size: it.pack_size ?? null,
    hsn_code: it.hsn_code ?? null,
    mrp: it.mrp ?? 0,
    cost_price: it.cost_price ?? 0,
    margin_percent: it.margin_percent ?? 0,
    discount_percent: it.discount_percent ?? 0,
    discount: it.discount ?? 0,
    taxable_value: it.taxable_value ?? 0,
  };
}

function writeQuotationLines(
  db: ReturnType<typeof getDb>,
  quotationId: number,
  data: QuotationInput
): void {
  if (!data.items.length) throw new Error('Cannot create an empty quotation.');

  const insertItem = db.prepare(
    `INSERT INTO quotation_items
      (quotation_id, medicine_name, manufacturer, pack_size, hsn_code, quantity, mrp,
       cost_price, margin_percent, price, gst_rate, discount_percent, discount,
       taxable_value, line_total)
     VALUES (@quotation_id, @medicine_name, @manufacturer, @pack_size, @hsn_code, @quantity, @mrp,
             @cost_price, @margin_percent, @price, @gst_rate, @discount_percent, @discount,
             @taxable_value, @line_total)`
  );

  const resolved: {
    medicineName: string;
    manufacturer: string | null;
    packSize: string | null;
    hsnCode: string | null;
    quantity: number;
    mrp: number;
    costPrice: number;
    marginPercent: number;
    unitPrice: number;
    gstRate: number;
    discountPercent: number;
    lineGross: number;
  }[] = [];

  for (const item of data.items) {
    const medicineName = (item.medicine_name ?? '').trim();
    if (!medicineName) throw new Error('Medicine name is required on every line.');

    const quantity = item.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Quantity must be greater than zero for ${medicineName}.`);
    }

    const unitPrice = Number(item.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Rate cannot be negative for ${medicineName}.`);
    }

    const mrp =
      item.mrp != null && Number.isFinite(item.mrp) ? Number(item.mrp) : 0;
    if (mrp < 0) throw new Error(`MRP cannot be negative for ${medicineName}.`);

    const costPrice =
      item.cost_price != null && Number.isFinite(item.cost_price)
        ? Math.max(0, Number(item.cost_price))
        : 0;

    const marginPercent = Math.min(
      Math.max(0, item.margin_percent ?? 0),
      1000
    );

    const gstRate = Math.min(Math.max(0, item.gst_rate ?? 0), 100);
    const discountPercent = Math.min(Math.max(0, item.discount_percent ?? 0), 100);

    resolved.push({
      medicineName,
      manufacturer: blankToNull(item.manufacturer),
      packSize: blankToNull(item.pack_size),
      hsnCode: blankToNull(item.hsn_code),
      quantity,
      mrp,
      costPrice,
      marginPercent,
      unitPrice,
      gstRate,
      discountPercent,
      lineGross: unitPrice * quantity,
    });
  }

  const invoice = computeSaleInvoice(
    resolved.map((row) => ({
      gross: row.lineGross,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
    }))
  );

  for (const row of resolved) {
    const lineAmounts = saleLineAmounts({
      gross: row.lineGross,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
    });
    insertItem.run({
      quotation_id: quotationId,
      medicine_name: row.medicineName,
      manufacturer: row.manufacturer,
      pack_size: row.packSize,
      hsn_code: row.hsnCode,
      quantity: row.quantity,
      mrp: row.mrp,
      cost_price: row.costPrice,
      margin_percent: row.marginPercent,
      price: row.unitPrice,
      gst_rate: row.gstRate,
      discount_percent: row.discountPercent,
      discount: lineAmounts.discountAmount,
      taxable_value: lineAmounts.taxable,
      line_total: lineAmounts.gross,
    });
  }

  db.prepare(
    `UPDATE quotations SET
      customer_id = ?,
      notes = ?,
      subtotal = ?, discount = ?, discount_percent = ?, cgst = ?, sgst = ?, total = ?
     WHERE id = ?`
  ).run(
    data.customer_id ?? null,
    blankToNull(data.notes),
    invoice.subtotal,
    invoice.discountAmount,
    0,
    invoice.cgst,
    invoice.sgst,
    invoice.total,
    quotationId
  );
}

export function createQuotation(input: QuotationInput): QuotationWithItems {
  const db = getDb();
  const tx = db.transaction((data: QuotationInput) => {
    const now = new Date();
    const quotationDate = now.toISOString();
    const quotationNo = nextQuotationNo();

    const info = db
      .prepare(
        `INSERT INTO quotations
          (quotation_no, customer_id, quotation_date, notes, subtotal, discount, discount_percent, cgst, sgst, total)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)`
      )
      .run(quotationNo, data.customer_id ?? null, quotationDate, blankToNull(data.notes));
    const id = Number(info.lastInsertRowid);
    writeQuotationLines(db, id, data);
    return id;
  });

  const id = tx(input);
  return getQuotation(id)!;
}

export function updateQuotation(id: number, input: QuotationInput): QuotationWithItems {
  const db = getDb();
  const tx = db.transaction((data: QuotationInput) => {
    const existing = db.prepare('SELECT id FROM quotations WHERE id = ?').get(id) as
      | { id: number }
      | undefined;
    if (!existing) throw new Error('Quotation not found.');
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(id);
    writeQuotationLines(db, id, data);
  });

  tx(input);
  return getQuotation(id)!;
}

export function getQuotation(id: number): QuotationWithItems | null {
  const db = getDb();
  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id) as
    | Quotation
    | undefined;
  if (!quotation) return null;
  const items = (
    db
      .prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id')
      .all(id) as QuotationItem[]
  ).map(normalizeItem);
  return withCustomer(quotation, items);
}

export function listQuotations(from?: string, to?: string): QuotationWithItems[] {
  const db = getDb();
  let rows: Quotation[];
  if (from && to) {
    rows = db
      .prepare(
        `SELECT * FROM quotations WHERE date(quotation_date) BETWEEN ? AND ?
         ORDER BY quotation_date DESC, id DESC LIMIT 500`
      )
      .all(from, to) as Quotation[];
  } else {
    rows = db
      .prepare('SELECT * FROM quotations ORDER BY quotation_date DESC, id DESC LIMIT 200')
      .all() as Quotation[];
  }
  return rows.map((r) => getQuotation(r.id)!);
}
