import React, { useCallback, useEffect, useState } from 'react';
import type {
  Supplier,
  Purchase,
  Medicine,
  PurchaseItemInput,
  PurchaseWithItems,
} from '../../shared/types';
import { inr, formatDate, todayIso, monthStartIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

interface DraftItem extends PurchaseItemInput {
  medicine_name: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Markup % from purchase cost to sale price. */
function marginPercent(purchase: number, sale: number): number {
  if (purchase <= 0) return 0;
  return round2(((sale - purchase) / purchase) * 100);
}

function saleFromMargin(purchase: number, marginPct: number): number {
  if (purchase <= 0) return 0;
  return round2(purchase * (1 + marginPct / 100));
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
    <div className="space-y-4">
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

      <div className="card overflow-hidden">
        {!purchases ? (
          <Spinner />
        ) : purchases.length === 0 ? (
          <EmptyState message="No purchases in the selected range." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
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
                  <th className="th text-right">Purch.</th>
                  <th className="th text-right">Margin</th>
                  <th className="th text-right">Sale</th>
                  <th className="th text-right">MRP</th>
                  <th className="th text-right">Line</th>
                </tr>
              </thead>
              <tbody>
                {viewing.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="td">{it.medicine_name}</td>
                    <td className="td">{it.batch_no}</td>
                    <td className="td">{formatDate(it.expiry_date)}</td>
                    <td className="td text-center">{it.quantity}</td>
                    <td className="td text-right">{inr(it.purchase_price)}</td>
                    <td className="td text-right">
                      {marginPercent(it.purchase_price, it.sale_price).toFixed(1)}%
                    </td>
                    <td className="td text-right">{inr(it.sale_price)}</td>
                    <td className="td text-right">{inr(it.mrp)}</td>
                    <td className="td text-right">
                      {inr(it.purchase_price * it.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right">
              <div className="text-sm text-slate-500">Total Purchase Value</div>
              <div className="text-xl font-bold text-brand-700">
                {inr(viewing.total_amount)}
              </div>
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
  const [notes, setNotes] = useState(initial?.notes ?? '');
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

  const total = items.reduce((s, it) => s + it.purchase_price * it.quantity, 0);

  const save = async () => {
    if (items.length === 0) return onError('Add at least one item.');
    for (const it of items) {
      if (!it.batch_no.trim() || !it.expiry_date) {
        return onError(`Batch number and expiry required for ${it.medicine_name}.`);
      }
      if (it.quantity <= 0) return onError(`Quantity must be positive for ${it.medicine_name}.`);
    }
    const payload = {
      supplier_id: supplierId,
      invoice_no: invoiceNo.trim() || null,
      purchase_date: date,
      notes: notes.trim() || null,
      items: items.map(({ medicine_name, ...rest }) => rest),
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
      wide
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
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
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
        </div>

        <div className="relative">
          <label className="label">Add Medicine</label>
          <input
            className="input"
            placeholder="Search medicine to add..."
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

        {items.length === 0 ? (
          <EmptyState message="No items added." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Medicine</th>
                  <th className="th">Batch</th>
                  <th className="th">Expiry</th>
                  <th className="th">Qty</th>
                  <th className="th">MRP</th>
                  <th className="th">Purch.</th>
                  <th className="th">Margin %</th>
                  <th className="th">Sale</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
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
                        type="date"
                        className="input w-36 px-2 py-1"
                        value={it.expiry_date}
                        onChange={(e) => patch(idx, { expiry_date: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input
                        type="number"
                        min={1}
                        className="input w-16 px-2 py-1"
                        value={it.quantity}
                        onChange={(e) => patch(idx, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="td">
                      <input
                        type="number"
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        value={it.mrp}
                        onChange={(e) => patch(idx, { mrp: Number(e.target.value) })}
                      />
                    </td>
                    <td className="td">
                      <input
                        type="number"
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        value={it.purchase_price}
                        onChange={(e) => {
                          const purchase_price = Number(e.target.value);
                          const margin = marginPercent(it.purchase_price, it.sale_price);
                          patch(idx, {
                            purchase_price,
                            sale_price: saleFromMargin(purchase_price, margin),
                          });
                        }}
                      />
                    </td>
                    <td className="td">
                      <input
                        type="number"
                        step="0.1"
                        className="input w-16 px-2 py-1"
                        title="Markup % on purchase cost"
                        value={marginPercent(it.purchase_price, it.sale_price)}
                        onChange={(e) =>
                          patch(idx, {
                            sale_price: saleFromMargin(
                              it.purchase_price,
                              Number(e.target.value)
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="td">
                      <input
                        type="number"
                        step="0.01"
                        className="input w-20 px-2 py-1"
                        value={it.sale_price}
                        onChange={(e) => patch(idx, { sale_price: Number(e.target.value) })}
                      />
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="w-1/2">
            <label className="label">Notes</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500">Total Purchase Value</div>
            <div className="text-xl font-bold text-brand-700">{inr(total)}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
