import React, { useCallback, useEffect, useState } from 'react';
import type {
  Supplier,
  Purchase,
  Medicine,
  PurchaseItemInput,
  PurchaseWithItems,
} from '../../shared/types';
import { inr, formatDate, formatExpiry, todayIso, monthStartIso, expiryMonthInputValue } from '../lib/format';
import { purchaseLineAmounts, purchaseInvoiceTotals, round2 } from '../../shared/gst';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg, NumberInput } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

interface DraftItem extends PurchaseItemInput {
  medicine_name: string;
  /** Markup % applied on net rate (rate after discount). */
  margin_percent: number;
}

function netPurchaseRate(purchase: number, discountPercent: number): number {
  const disc = Math.min(Math.max(0, discountPercent ?? 0), 100);
  return round2(Math.max(0, purchase) * (1 - disc / 100));
}

/** Sale = (rate after disc) + margin % of that net rate. */
function saleFromMargin(purchase: number, marginPct: number, discountPercent = 0): number {
  const net = netPurchaseRate(purchase, discountPercent);
  if (net <= 0) return 0;
  return round2(net * (1 + marginPct / 100));
}

function marginFromSale(purchase: number, sale: number, discountPercent = 0): number {
  const net = netPurchaseRate(purchase, discountPercent);
  if (net <= 0) return 0;
  return round2(((sale - net) / net) * 100);
}

function lineTotals(it: PurchaseItemInput) {
  return purchaseLineAmounts({
    purchase_price: it.purchase_price,
    discount_percent: it.discount_percent,
    quantity: it.quantity,
    gst_rate: it.gst_rate,
  });
}

export function Purchases() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseWithItems | null>(null);
  const [viewing, setViewing] = useState<PurchaseWithItems | null>(null);

  const load = useCallback(() => {
    setPurchases(null);
    window.pharmacy.purchases.list(from, to).then(setPurchases);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.pharmacy.suppliers.list().then(setSuppliers);
  }, []);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openView = async (id: number) => {
    try {
      const p = await window.pharmacy.purchases.get(id);
      if (!p) return toast.error('Purchase not found.');
      setViewing(p);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const openEdit = async (id: number) => {
    try {
      const p = await window.pharmacy.purchases.get(id);
      if (!p) return toast.error('Purchase not found.');
      setEditing(p);
      setFormOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const rangeTotal = purchases?.reduce((s, p) => s + p.total_amount, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-4">
        <ReadOnlyNotice />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Purchases</h1>
          <button className="btn-primary" onClick={openNew} disabled={!canWrite}>
            + New Purchase
          </button>
        </div>

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
            <div className="text-xl font-bold text-brand-700">{inr(rangeTotal)}</div>
          </div>
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto">
        {!purchases ? (
          <Spinner />
        ) : purchases.length === 0 ? (
          <EmptyState message="No purchases in the selected range." />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Invoice No</th>
                <th className="th">Supplier</th>
                <th className="th text-right">Amount</th>
                <th className="th">Notes</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td">{formatDate(p.purchase_date)}</td>
                  <td className="td font-medium">{p.invoice_no || '-'}</td>
                  <td className="td">
                    {suppliers.find((s) => s.id === p.supplier_id)?.name || '-'}
                  </td>
                  <td className="td text-right">{inr(p.total_amount)}</td>
                  <td className="td">{p.notes || '-'}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => openView(p.id)}
                      >
                        View
                      </button>
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => openEdit(p.id)}
                        disabled={!canWrite}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <PurchaseForm
          suppliers={suppliers}
          initial={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
            toast.success(
              editing ? 'Purchase updated and stock adjusted.' : 'Purchase saved and stock updated.'
            );
          }}
          onError={(m) => toast.error(m)}
        />
      )}

      <Modal
        open={!!viewing}
        title={
          viewing
            ? `Purchase ${viewing.invoice_no || `#${viewing.id}`}`
            : ''
        }
        onClose={() => setViewing(null)}
        wide
        footer={
          viewing && (
            <>
              <button className="btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
              {canWrite && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    const id = viewing.id;
                    setViewing(null);
                    openEdit(id);
                  }}
                >
                  Edit
                </button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div>Date: {formatDate(viewing.purchase_date)}</div>
              <div>Supplier: {viewing.supplier_name || '-'}</div>
              {viewing.notes && <div className="col-span-2">Notes: {viewing.notes}</div>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Medicine</th>
                  <th className="th">Batch</th>
                  <th className="th">Expiry</th>
                  <th className="th text-center">Qty</th>
                  <th className="th text-center">Free</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Disc %</th>
                  <th className="th text-right">GST %</th>
                  <th className="th text-right">Taxable</th>
                  <th className="th text-right">Line Total</th>
                  <th className="th text-right">Margin</th>
                  <th className="th text-right">Sale</th>
                  <th className="th text-right">MRP</th>
                </tr>
              </thead>
              <tbody>
                {viewing.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="td">{it.medicine_name}</td>
                    <td className="td">{it.batch_no}</td>
                    <td className="td">{formatExpiry(it.expiry_date)}</td>
                    <td className="td text-center">{it.quantity}</td>
                    <td className="td text-center">{it.free_quantity || '-'}</td>
                    <td className="td text-right">{inr(it.purchase_price)}</td>
                    <td className="td text-right">
                      {it.discount_percent > 0 ? `${it.discount_percent}%` : '-'}
                    </td>
                    <td className="td text-right">{it.gst_rate}%</td>
                    <td className="td text-right">{inr(it.taxable_value)}</td>
                    <td className="td text-right">{inr(it.line_total)}</td>
                    <td className="td text-right">
                      {marginFromSale(
                        it.purchase_price,
                        it.sale_price,
                        it.discount_percent
                      ).toFixed(1)}%
                    </td>
                    <td className="td text-right">{inr(it.sale_price)}</td>
                    <td className="td text-right">{inr(it.mrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto w-72 space-y-1 text-sm">
              {(() => {
                const t = purchaseInvoiceTotals(viewing.items);
                return (
                  <>
                    <TotalsRow label="Total Discount" value={inr(t.discount)} />
                    <TotalsRow label="Total Taxable Value" value={inr(t.taxable)} />
                    <TotalsRow label="Total GST" value={inr(t.gst)} />
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                      <span>Total Invoice Amount</span>
                      <span className="text-brand-700">{inr(t.total)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PurchaseForm({
  suppliers,
  initial,
  onClose,
  onSaved,
  onError,
}: {
  suppliers: Supplier[];
  initial: PurchaseWithItems | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [supplierId, setSupplierId] = useState<number | null>(
    initial?.supplier_id ?? null
  );
  const [invoiceNo, setInvoiceNo] = useState(initial?.invoice_no ?? '');
  const [date, setDate] = useState(initial?.purchase_date ?? todayIso());
  const [items, setItems] = useState<DraftItem[]>(
    () =>
      initial?.items.map((it) => ({
        medicine_id: it.medicine_id,
        medicine_name: it.medicine_name,
        batch_no: it.batch_no,
        expiry_date: it.expiry_date,
        mrp: it.mrp,
        purchase_price: it.purchase_price,
        sale_price: it.sale_price,
        gst_rate: it.gst_rate,
        quantity: it.quantity,
        discount_percent: it.discount_percent ?? 0,
        free_quantity: it.free_quantity ?? 0,
        margin_percent: marginFromSale(
          it.purchase_price,
          it.sale_price,
          it.discount_percent ?? 0
        ),
      })) ?? []
  );
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [medResults, setMedResults] = useState<Medicine[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setMedResults([]);
      return;
    }
    const t = setTimeout(() => {
      window.pharmacy.medicines.list(search).then(setMedResults);
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  const addMedicine = (m: Medicine) => {
    setItems((prev) => [
      ...prev,
      {
        medicine_id: m.id,
        medicine_name: m.name,
        batch_no: '',
        expiry_date: '',
        mrp: 0,
        purchase_price: 0,
        sale_price: 0,
        gst_rate: m.gst_rate,
        quantity: 1,
        discount_percent: 0,
        free_quantity: 0,
        margin_percent: 0,
      },
    ]);
    setSearch('');
    setMedResults([]);
  };

  const patch = (idx: number, p: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totals = purchaseInvoiceTotals(items);

  const save = async () => {
    if (items.length === 0) return onError('Add at least one item.');
    for (const it of items) {
      if (!it.batch_no.trim() || !it.expiry_date) {
        return onError(`Batch number and expiry month required for ${it.medicine_name}.`);
      }
      if (it.quantity <= 0) return onError(`Quantity must be positive for ${it.medicine_name}.`);
      if ((it.free_quantity ?? 0) < 0) {
        return onError(`Free quantity cannot be negative for ${it.medicine_name}.`);
      }
      if ((it.discount_percent ?? 0) < 0 || (it.discount_percent ?? 0) > 100) {
        return onError(`Discount must be 0–100% for ${it.medicine_name}.`);
      }
    }
    const payload = {
      supplier_id: supplierId,
      invoice_no: invoiceNo.trim() || null,
      purchase_date: date,
      notes: initial?.notes ?? null,
      items: items.map(
        ({ medicine_name: _n, margin_percent: _m, ...rest }) => rest
      ),
    };
    setBusy(true);
    try {
      if (initial) await window.pharmacy.purchases.update(initial.id, payload);
      else await window.pharmacy.purchases.create(payload);
      onSaved();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={initial ? 'Edit Purchase' : 'New Purchase (Stock Inward)'}
      onClose={onClose}
      xl
      bodyScroll={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {initial ? 'Update Purchase' : 'Save Purchase'}
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="shrink-0 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="label">Supplier</label>
              <select
                className="input"
                value={supplierId ?? ''}
                onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">-- Select --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Invoice No</label>
              <input
                className="input"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="relative">
              <label className="label">Add Medicine</label>
              <input
                className="input"
                placeholder="Search medicine..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {medResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {medResults.map((m) => (
                    <button
                      key={m.id}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-brand-50"
                      onClick={() => addMedicine(m)}
                    >
                      <span className="font-medium">{m.name}</span>{' '}
                      <span className="text-xs text-slate-400">
                        {m.manufacturer} · {m.gst_rate}% GST
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
          {items.length === 0 ? (
            <EmptyState message="No items added." />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="th">Medicine</th>
                  <th className="th">Batch</th>
                  <th className="th">Expiry</th>
                  <th className="th">Qty</th>
                  <th className="th">Free</th>
                  <th className="th">MRP</th>
                  <th className="th">Rate</th>
                  <th className="th">Disc %</th>
                  <th className="th">GST %</th>
                  <th className="th">Margin %</th>
                  <th className="th">Sale</th>
                  <th className="th text-right">Taxable</th>
                  <th className="th text-right">Total</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const amounts = lineTotals(it);
                  return (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="td">{it.medicine_name}</td>
                    <td className="td">
                      <input
                        className="input w-24 px-2 py-1"
                        value={it.batch_no}
                        onChange={(e) => patch(idx, { batch_no: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input
                        type="month"
                        className="input w-32 px-2 py-1"
                        title="Expiry MM-YYYY"
                        value={expiryMonthInputValue(it.expiry_date)}
                        onChange={(e) => patch(idx, { expiry_date: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        min={1}
                        className="input w-16 px-2 py-1"
                        value={it.quantity}
                        emptyValue={1}
                        onValueChange={(quantity) => patch(idx, { quantity })}
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        min={0}
                        className="input w-14 px-2 py-1"
                        title="Scheme / bonus quantity"
                        value={it.free_quantity}
                        onValueChange={(free_quantity) =>
                          patch(idx, { free_quantity: Math.max(0, free_quantity) })
                        }
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        value={it.mrp}
                        onValueChange={(mrp) => patch(idx, { mrp })}
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        title="Purchase rate before discount (GST-exclusive)"
                        value={it.purchase_price}
                        onValueChange={(purchase_price) =>
                          patch(idx, {
                            purchase_price,
                            sale_price: saleFromMargin(
                              purchase_price,
                              it.margin_percent,
                              it.discount_percent
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        min={0}
                        max={100}
                        step="0.1"
                        className="input w-14 px-2 py-1"
                        value={it.discount_percent}
                        onValueChange={(raw) => {
                          const discount_percent = Math.min(100, Math.max(0, raw));
                          patch(idx, {
                            discount_percent,
                            sale_price: saleFromMargin(
                              it.purchase_price,
                              it.margin_percent,
                              discount_percent
                            ),
                          });
                        }}
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        min={0}
                        max={100}
                        step="0.1"
                        className="input w-14 px-2 py-1"
                        title="GST % (used for taxable / line total)"
                        value={it.gst_rate}
                        onValueChange={(raw) =>
                          patch(idx, {
                            gst_rate: Math.min(100, Math.max(0, raw)),
                          })
                        }
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        step="0.1"
                        className="input w-16 px-2 py-1"
                        title="Sale = (rate after disc) + this margin %"
                        value={it.margin_percent}
                        onValueChange={(margin_percent) =>
                          patch(idx, {
                            margin_percent,
                            sale_price: saleFromMargin(
                              it.purchase_price,
                              margin_percent,
                              it.discount_percent
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="td">
                      <NumberInput
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        value={it.sale_price}
                        onValueChange={(sale_price) =>
                          patch(idx, {
                            sale_price,
                            margin_percent: marginFromSale(
                              it.purchase_price,
                              sale_price,
                              it.discount_percent
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="td text-right text-slate-600 whitespace-nowrap">
                      {inr(amounts.taxable_value)}
                    </td>
                    <td className="td text-right font-medium whitespace-nowrap">
                      {inr(amounts.line_total)}
                    </td>
                    <td className="td text-right">
                      <button
                        className="text-red-500 hover:text-red-700"
                        onClick={() => removeItem(idx)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-slate-200 pt-2 text-sm">
          <span className="text-slate-600">
            Discount:{' '}
            <span className="font-medium text-slate-800">{inr(totals.discount)}</span>
          </span>
          <span className="text-slate-600">
            Taxable:{' '}
            <span className="font-medium text-slate-800">{inr(totals.taxable)}</span>
          </span>
          <span className="text-slate-600">
            GST:{' '}
            <span className="font-medium text-slate-800">{inr(totals.gst)}</span>
          </span>
          <span className="font-semibold text-slate-800">
            Invoice:{' '}
            <span className="text-brand-700">{inr(totals.total)}</span>
          </span>
        </div>
      </div>
    </Modal>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
