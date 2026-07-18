import React, { useCallback, useEffect, useState } from 'react';
import type {
  Supplier,
  Purchase,
  Medicine,
  PurchaseItemInput,
} from '../../shared/types';
import { inr, formatDate, todayIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

interface DraftItem extends PurchaseItemInput {
  medicine_name: string;
}

export function Purchases() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modal, setModal] = useState(false);

  const load = useCallback(() => {
    window.pharmacy.purchases.list().then(setPurchases);
  }, []);

  useEffect(() => {
    load();
    window.pharmacy.suppliers.list().then(setSuppliers);
  }, [load]);

  return (
    <div className="space-y-4">
      <ReadOnlyNotice />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Purchases</h1>
        <button className="btn-primary" onClick={() => setModal(true)} disabled={!canWrite}>
          + New Purchase
        </button>
      </div>

      <div className="card overflow-hidden">
        {!purchases ? (
          <Spinner />
        ) : purchases.length === 0 ? (
          <EmptyState message="No purchases recorded yet." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Invoice No</th>
                <th className="th">Supplier</th>
                <th className="th text-right">Amount</th>
                <th className="th">Notes</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="td">{formatDate(p.purchase_date)}</td>
                  <td className="td font-medium">{p.invoice_no || '-'}</td>
                  <td className="td">
                    {suppliers.find((s) => s.id === p.supplier_id)?.name || '-'}
                  </td>
                  <td className="td text-right">{inr(p.total_amount)}</td>
                  <td className="td">{p.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <PurchaseForm
          suppliers={suppliers}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            load();
            toast.success('Purchase saved and stock updated.');
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

function PurchaseForm({
  suppliers,
  onClose,
  onSaved,
  onError,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
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
    setBusy(true);
    try {
      await window.pharmacy.purchases.create({
        supplier_id: supplierId,
        invoice_no: invoiceNo.trim() || null,
        purchase_date: date,
        notes: notes.trim() || null,
        items: items.map(({ medicine_name, ...rest }) => rest),
      });
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
      title="New Purchase (Stock Inward)"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            Save Purchase
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
                        onChange={(e) =>
                          patch(idx, { purchase_price: Number(e.target.value) })
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
