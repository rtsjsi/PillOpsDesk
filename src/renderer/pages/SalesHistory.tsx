import React, { useCallback, useEffect, useState } from 'react';
import type { SaleWithItems } from '../../shared/types';
import { inr, formatDateTime, todayIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';

export function SalesHistory() {
  const toast = useToast();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [sales, setSales] = useState<SaleWithItems[] | null>(null);
  const [selected, setSelected] = useState<SaleWithItems | null>(null);

  const load = useCallback(() => {
    setSales(null);
    window.pharmacy.sales.list(from, to).then(setSales);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const reprint = async (id: number) => {
    try {
      await window.pharmacy.print.invoice(id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const dayTotal = sales?.reduce((s, x) => s + x.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Sales History</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={load}>
          Filter
        </button>
        <div className="ml-auto text-right">
          <div className="text-sm text-slate-500">Total for range</div>
          <div className="text-xl font-bold text-brand-700">{inr(dayTotal)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {!sales ? (
          <Spinner />
        ) : sales.length === 0 ? (
          <EmptyState message="No sales in the selected range." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Date</th>
                <th className="th">Customer</th>
                <th className="th text-center">Items</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td font-medium">{s.invoice_no}</td>
                  <td className="td">{formatDateTime(s.sale_date)}</td>
                  <td className="td">{s.customer_name || 'Walk-in'}</td>
                  <td className="td text-center">{s.items.length}</td>
                  <td className="td text-right font-medium">{inr(s.total)}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => setSelected(s)}
                      >
                        View
                      </button>
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => reprint(s.id)}
                      >
                        Print
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!selected}
        title={selected ? `Invoice ${selected.invoice_no}` : ''}
        onClose={() => setSelected(null)}
        wide
        footer={
          selected && (
            <>
              <button className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
              <button className="btn-primary" onClick={() => reprint(selected.id)}>
                Print
              </button>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-slate-600">
              <div>
                <div>{formatDateTime(selected.sale_date)}</div>
                <div>Customer: {selected.customer_name || 'Walk-in'}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Item</th>
                  <th className="th text-center">Qty</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-center">GST</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="td">
                      {it.medicine_name}
                      <span className="text-xs text-slate-400"> ({it.batch_no})</span>
                    </td>
                    <td className="td text-center">{it.quantity}</td>
                    <td className="td text-right">{inr(it.price)}</td>
                    <td className="td text-center">{it.gst_rate}%</td>
                    <td className="td text-right">{inr(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto w-64 space-y-1 text-sm">
              <Row label="Taxable" value={inr(selected.subtotal)} />
              <Row label="CGST" value={inr(selected.cgst)} />
              <Row label="SGST" value={inr(selected.sgst)} />
              <Row label="Discount" value={`- ${inr(selected.discount)}`} />
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
                <span>Total</span>
                <span className="text-brand-700">{inr(selected.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
