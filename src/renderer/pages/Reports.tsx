import React, { useEffect, useState } from 'react';
import type {
  SalesReportRow,
  PurchasesReportRow,
  GstSummaryRow,
  StockRow,
} from '../../shared/types';
import { inr, formatDate, todayIso, monthStartIso, daysUntil, toCsv } from '../lib/format';
import { Spinner, EmptyState, Badge, useToast } from '../components/ui';

type Tab = 'sales' | 'purchases' | 'gst' | 'lowstock' | 'expiring' | 'valuation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'gst', label: 'GST Summary' },
  { id: 'lowstock', label: 'Low Stock' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'valuation', label: 'Stock Valuation' },
];

export function Reports() {
  const [tab, setTab] = useState<Tab>('sales');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'sales' && <SalesReport />}
      {tab === 'purchases' && <PurchasesReport />}
      {tab === 'gst' && <GstReport />}
      {tab === 'lowstock' && <LowStockReport />}
      {tab === 'expiring' && <ExpiringReport />}
      {tab === 'valuation' && <ValuationReport />}
    </div>
  );
}

function ExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const toast = useToast();
  const onClick = async () => {
    if (rows.length === 0) return toast.error('Nothing to export.');
    const ok = await window.pharmacy.reports.exportCsv(filename, toCsv(headers, rows));
    if (ok) toast.success('Exported.');
  };
  return (
    <button className="btn-secondary" onClick={onClick}>
      Export CSV
    </button>
  );
}

function DateRange({
  from,
  to,
  setFrom,
  setTo,
  onRun,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">From</label>
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <label className="label">To</label>
        <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button className="btn-primary" onClick={onRun}>
        Run
      </button>
    </div>
  );
}

function SalesReport() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<SalesReportRow[] | null>(null);

  const run = () => {
    setRows(null);
    window.pharmacy.reports.salesReport(from, to).then(setRows);
  };
  useEffect(run, []);

  const grand = rows?.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} />
        {rows && (
          <ExportButton
            filename={`sales-${from}-to-${to}.csv`}
            headers={['Date', 'Invoices', 'Taxable', 'Discount', 'CGST', 'SGST', 'Total']}
            rows={rows.map((r) => [
              r.date,
              r.invoice_count,
              r.subtotal.toFixed(2),
              r.discount.toFixed(2),
              r.cgst.toFixed(2),
              r.sgst.toFixed(2),
              r.total.toFixed(2),
            ])}
          />
        )}
      </div>
      <div className="card overflow-hidden">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No sales in range." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Date</th>
                <th className="th text-center">Invoices</th>
                <th className="th text-right">Taxable</th>
                <th className="th text-right">CGST</th>
                <th className="th text-right">SGST</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-t border-slate-100">
                  <td className="td">{formatDate(r.date)}</td>
                  <td className="td text-center">{r.invoice_count}</td>
                  <td className="td text-right">{inr(r.subtotal)}</td>
                  <td className="td text-right">{inr(r.cgst)}</td>
                  <td className="td text-right">{inr(r.sgst)}</td>
                  <td className="td text-right font-medium">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="td font-bold" colSpan={5}>
                  Grand Total
                </td>
                <td className="td text-right font-bold text-brand-700">{inr(grand)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function PurchasesReport() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<PurchasesReportRow[] | null>(null);

  const run = () => {
    setRows(null);
    window.pharmacy.reports.purchasesReport(from, to).then(setRows);
  };
  useEffect(run, []);

  const grand = rows?.reduce((s, r) => s + r.total, 0) ?? 0;
  const invoiceTotal = rows?.reduce((s, r) => s + r.invoice_count, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} />
        {rows && (
          <ExportButton
            filename={`purchases-${from}-to-${to}.csv`}
            headers={['Date', 'Purchases', 'Total']}
            rows={rows.map((r) => [r.date, r.invoice_count, r.total.toFixed(2)])}
          />
        )}
      </div>
      <div className="card overflow-hidden">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No purchases in range." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Date</th>
                <th className="th text-center">Purchases</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-t border-slate-100">
                  <td className="td">{formatDate(r.date)}</td>
                  <td className="td text-center">{r.invoice_count}</td>
                  <td className="td text-right font-medium">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="td font-bold">Grand Total</td>
                <td className="td text-center font-bold">{invoiceTotal}</td>
                <td className="td text-right font-bold text-brand-700">{inr(grand)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function GstReport() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<GstSummaryRow[] | null>(null);

  const run = () => {
    setRows(null);
    window.pharmacy.reports.gstSummary(from, to).then(setRows);
  };
  useEffect(run, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} />
        {rows && (
          <ExportButton
            filename={`gst-summary-${from}-to-${to}.csv`}
            headers={['GST Rate', 'Taxable Value', 'CGST', 'SGST', 'Total Tax']}
            rows={rows.map((r) => [
              `${r.gst_rate}%`,
              r.taxable_value.toFixed(2),
              r.cgst.toFixed(2),
              r.sgst.toFixed(2),
              r.total_tax.toFixed(2),
            ])}
          />
        )}
      </div>
      <div className="card overflow-hidden">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No taxable sales in range." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">GST Rate</th>
                <th className="th text-right">Taxable Value</th>
                <th className="th text-right">CGST</th>
                <th className="th text-right">SGST</th>
                <th className="th text-right">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.gst_rate} className="border-t border-slate-100">
                  <td className="td font-medium">{r.gst_rate}%</td>
                  <td className="td text-right">{inr(r.taxable_value)}</td>
                  <td className="td text-right">{inr(r.cgst)}</td>
                  <td className="td text-right">{inr(r.sgst)}</td>
                  <td className="td text-right font-medium">{inr(r.total_tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LowStockReport() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  useEffect(() => {
    window.pharmacy.reports.lowStock().then(setRows);
  }, []);
  return (
    <StockTable
      rows={rows}
      emptyMsg="No low-stock items."
      filename="low-stock.csv"
      showExpiry
    />
  );
}

function ExpiringReport() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const run = () => {
    setRows(null);
    window.pharmacy.reports.expiring(days).then(setRows);
  };
  useEffect(run, []);
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="label">Within (days)</label>
          <input
            type="number"
            className="input w-32"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </div>
        <button className="btn-primary" onClick={run}>
          Run
        </button>
      </div>
      <StockTable
        rows={rows}
        emptyMsg="No expiring items in range."
        filename="expiring.csv"
        showExpiry
      />
    </div>
  );
}

function ValuationReport() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  useEffect(() => {
    window.pharmacy.reports.stockValuation().then(setRows);
  }, []);
  const totalCost = rows?.reduce((s, r) => s + r.purchase_price * r.quantity_in_stock, 0) ?? 0;
  const totalMrp = rows?.reduce((s, r) => s + r.mrp * r.quantity_in_stock, 0) ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-sm text-slate-500">Stock Value (at cost)</div>
          <div className="text-2xl font-bold text-slate-800">{inr(totalCost)}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-slate-500">Stock Value (at MRP)</div>
          <div className="text-2xl font-bold text-brand-700">{inr(totalMrp)}</div>
        </div>
      </div>
      <StockTable
        rows={rows}
        emptyMsg="No stock on hand."
        filename="stock-valuation.csv"
        showValues
      />
    </div>
  );
}

function StockTable({
  rows,
  emptyMsg,
  filename,
  showExpiry,
  showValues,
}: {
  rows: StockRow[] | null;
  emptyMsg: string;
  filename: string;
  showExpiry?: boolean;
  showValues?: boolean;
}) {
  return (
    <div className="space-y-3">
      {rows && rows.length > 0 && (
        <div className="flex justify-end">
          <ExportButton
            filename={filename}
            headers={['Medicine', 'Batch', 'Expiry', 'Qty', 'Purchase', 'MRP']}
            rows={rows.map((r) => [
              r.medicine_name,
              r.batch_no,
              r.expiry_date,
              r.quantity_in_stock,
              r.purchase_price.toFixed(2),
              r.mrp.toFixed(2),
            ])}
          />
        </div>
      )}
      <div className="card overflow-hidden">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message={emptyMsg} />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Medicine</th>
                <th className="th">Batch</th>
                {showExpiry && <th className="th">Expiry</th>}
                <th className="th text-center">Qty</th>
                {showValues && <th className="th text-right">Cost Value</th>}
                {showValues && <th className="th text-right">MRP Value</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = daysUntil(r.expiry_date);
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="td font-medium">{r.medicine_name}</td>
                    <td className="td">{r.batch_no}</td>
                    {showExpiry && (
                      <td className="td">
                        {formatDate(r.expiry_date)}{' '}
                        {d < 0 ? (
                          <Badge tone="red">Expired</Badge>
                        ) : d <= 90 ? (
                          <Badge tone="amber">{d}d</Badge>
                        ) : null}
                      </td>
                    )}
                    <td className="td text-center">{r.quantity_in_stock}</td>
                    {showValues && (
                      <td className="td text-right">
                        {inr(r.purchase_price * r.quantity_in_stock)}
                      </td>
                    )}
                    {showValues && (
                      <td className="td text-right">
                        {inr(r.mrp * r.quantity_in_stock)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
