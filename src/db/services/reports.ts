import { getDb } from '../index';
import { getSettings } from './settings';
import type {
  DashboardStats,
  StockRow,
  SalesReportRow,
  PurchasesReportRow,
  GstSummaryRow,
} from '@shared/types';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getDashboard(): DashboardStats {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const alertDays = getSettings().expiry_alert_days;

  const todaySales = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cnt
       FROM sales WHERE date(sale_date) = ?`
    )
    .get(today) as { total: number; cnt: number };

  const lowStock = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT b.medicine_id, SUM(b.quantity_in_stock) AS qty, m.reorder_level AS lvl
         FROM batches b JOIN medicines m ON m.id = b.medicine_id
         WHERE m.is_active = 1
         GROUP BY b.medicine_id
         HAVING qty <= lvl
       )`
    )
    .get() as { c: number };

  const expiringSoon = db
    .prepare(
      `SELECT COUNT(*) AS c FROM batches
       WHERE quantity_in_stock > 0 AND expiry_date >= ? AND expiry_date <= ?`
    )
    .get(today, addDays(alertDays)) as { c: number };

  const expired = db
    .prepare(
      'SELECT COUNT(*) AS c FROM batches WHERE quantity_in_stock > 0 AND expiry_date < ?'
    )
    .get(today) as { c: number };

  const totalMeds = db
    .prepare('SELECT COUNT(*) AS c FROM medicines WHERE is_active = 1')
    .get() as { c: number };

  return {
    todaySalesTotal: todaySales.total,
    todayInvoiceCount: todaySales.cnt,
    lowStockCount: lowStock.c,
    expiringSoonCount: expiringSoon.c,
    expiredCount: expired.c,
    totalMedicines: totalMeds.c,
  };
}

export function getLowStock(): StockRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.reorder_level AS reorder_level
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE m.is_active = 1
       AND m.id IN (
         SELECT medicine_id FROM batches
         GROUP BY medicine_id
         HAVING SUM(quantity_in_stock) <= (
           SELECT reorder_level FROM medicines WHERE id = medicine_id
         )
       )
       ORDER BY m.name`
    )
    .all() as StockRow[];
}

export function getExpiring(withinDays = 90): StockRow[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.reorder_level AS reorder_level
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE m.is_active = 1 AND b.quantity_in_stock > 0
         AND b.expiry_date >= ? AND b.expiry_date <= ?
       ORDER BY b.expiry_date`
    )
    .all(today, addDays(withinDays)) as StockRow[];
}

export function getExpiredInStock(): StockRow[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.reorder_level AS reorder_level
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE m.is_active = 1 AND b.quantity_in_stock > 0 AND b.expiry_date < ?
       ORDER BY b.expiry_date DESC`
    )
    .all(today) as StockRow[];
}

export function getSalesReport(from: string, to: string): SalesReportRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT date(sale_date) AS date,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(subtotal), 0) AS subtotal,
              COALESCE(SUM(discount), 0) AS discount,
              COALESCE(SUM(cgst), 0) AS cgst,
              COALESCE(SUM(sgst), 0) AS sgst,
              COALESCE(SUM(total), 0) AS total
       FROM sales
       WHERE date(sale_date) BETWEEN ? AND ?
       GROUP BY date(sale_date)
       ORDER BY date DESC`
    )
    .all(from, to) as SalesReportRow[];
}

export function getPurchasesReport(from: string, to: string): PurchasesReportRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT date(purchase_date) AS date,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(total_amount), 0) AS total
       FROM purchases
       WHERE date(purchase_date) BETWEEN ? AND ?
       GROUP BY date(purchase_date)
       ORDER BY date DESC`
    )
    .all(from, to) as PurchasesReportRow[];
}

export function getGstSummary(from: string, to: string): GstSummaryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT si.gst_rate AS gst_rate,
              COALESCE(SUM(si.line_total / (1 + si.gst_rate / 100.0)), 0) AS taxable_value,
              COALESCE(SUM((si.line_total - si.line_total / (1 + si.gst_rate / 100.0)) / 2), 0) AS cgst,
              COALESCE(SUM((si.line_total - si.line_total / (1 + si.gst_rate / 100.0)) / 2), 0) AS sgst,
              COALESCE(SUM(si.line_total - si.line_total / (1 + si.gst_rate / 100.0)), 0) AS total_tax
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE date(s.sale_date) BETWEEN ? AND ?
       GROUP BY si.gst_rate
       ORDER BY si.gst_rate`
    )
    .all(from, to) as GstSummaryRow[];
}

export function getStockValuation(): StockRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.gst_rate AS gst_rate, m.reorder_level AS reorder_level
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE m.is_active = 1 AND b.quantity_in_stock > 0
       ORDER BY m.name`
    )
    .all() as StockRow[];
}
