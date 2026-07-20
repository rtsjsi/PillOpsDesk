import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  SaleWithItems,
  Customer,
  SellableBatch,
  Batch,
} from '../../shared/types';
import { computeSaleInvoice, saleLineAmounts } from '../../shared/gst';
import { inr, formatDateTime, formatDate, todayIso, monthStartIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

interface CartLine {
  batch: SellableBatch;
  quantity: number;
  discount_percent: number;
}

export function Sales() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const location = useLocation();
  const navigate = useNavigate();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [sales, setSales] = useState<SaleWithItems[] | null>(null);
  const [selected, setSelected] = useState<SaleWithItems | null>(null);
  const [editing, setEditing] = useState<SaleWithItems | null>(null);
  const [newSaleOpen, setNewSaleOpen] = useState(false);

  const load = useCallback(() => {
    setSales(null);
    window.pharmacy.sales.list(from, to).then(setSales);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const state = location.state as { openNewSale?: boolean } | null;
    if (state?.openNewSale) {
      setNewSaleOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const reprint = async (id: number) => {
    try {
      await window.pharmacy.print.invoice(id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const openEdit = async (sale: SaleWithItems) => {
    if (sale.items.some((it) => it.batch_id == null)) {
      toast.error('Cannot edit this invoice — some items reference deleted batches.');
      return;
    }
    setEditing(sale);
  };

  const dayTotal = sales?.reduce((s, x) => s + x.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <ReadOnlyNotice />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Sales</h1>
        <button
          className="btn-primary"
          onClick={() => setNewSaleOpen(true)}
          disabled={!canWrite}
        >
          + New Sale
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
                        onClick={() => openEdit(s)}
                        disabled={!canWrite}
                      >
                        Edit
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
              {canWrite && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const s = selected;
                    setSelected(null);
                    openEdit(s);
                  }}
                >
                  Edit
                </button>
              )}
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
                  <th className="th text-center">Disc %</th>
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
                    <td className="td text-center">
                      {it.discount_percent > 0 ? `${it.discount_percent}%` : '-'}
                    </td>
                    <td className="td text-right">{inr(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto w-64 space-y-1 text-sm">
              {selected.discount > 0 && (
                <Row label="Discount" value={`- ${inr(selected.discount)}`} />
              )}
              <Row label="Taxable Value" value={inr(selected.subtotal)} />
              <Row label="CGST" value={inr(selected.cgst)} />
              <Row label="SGST" value={inr(selected.sgst)} />
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
                <span>Total</span>
                <span className="text-brand-700">{inr(selected.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {newSaleOpen && (
        <NewSaleForm
          onClose={() => setNewSaleOpen(false)}
          onSaved={(msg) => {
            setNewSaleOpen(false);
            load();
            toast.success(msg);
          }}
          onError={(m) => toast.error(m)}
        />
      )}

      {editing && (
        <SaleEditForm
          sale={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            toast.success('Invoice updated.');
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

function NewSaleForm({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (m: string) => void;
}) {
  const canWrite = useWriteAllowed();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SellableBatch[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.pharmacy.customers.list().then(setCustomers);
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      window.pharmacy.sales.searchSellable(search).then((r) => {
        setResults(r);
        setShowResults(true);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  const addToCart = (batch: SellableBatch) => {
    if (!canWrite) {
      onError('Sales is disabled until the subscription is renewed.');
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.batch.batch_id === batch.batch_id);
      if (idx >= 0) {
        const copy = [...prev];
        const nextQty = Math.min(copy[idx].quantity + 1, batch.quantity_in_stock);
        copy[idx] = { ...copy[idx], quantity: nextQty };
        return copy;
      }
      return [...prev, { batch, quantity: 1, discount_percent: 0 }];
    });
    setSearch('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  };

  const updateLine = (batchId: number, quantity: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.batch.batch_id !== batchId) return l;
        return {
          ...l,
          quantity: Math.max(1, Math.min(quantity, l.batch.quantity_in_stock)),
        };
      })
    );
  };

  const updateLineDiscount = (batchId: number, discount_percent: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.batch.batch_id === batchId
          ? { ...l, discount_percent: Math.min(100, Math.max(0, discount_percent)) }
          : l
      )
    );
  };

  const removeLine = (batchId: number) => {
    setCart((prev) => prev.filter((l) => l.batch.batch_id !== batchId));
  };

  const totals = useMemo(() => {
    const lines = cart.map((l) => ({
      gross: l.batch.sale_price * l.quantity,
      gst_rate: l.batch.gst_rate ?? 0,
      discount_percent: l.discount_percent ?? 0,
    }));
    return computeSaleInvoice(lines);
  }, [cart]);

  const checkout = async (print: boolean) => {
    if (cart.length === 0) {
      onError('Add at least one item.');
      return;
    }
    for (const l of cart) {
      if ((l.discount_percent ?? 0) < 0 || (l.discount_percent ?? 0) > 100) {
        onError(`Discount must be 0–100% for ${l.batch.name}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const sale = await window.pharmacy.sales.create({
        customer_id: customerId,
        items: cart.map((l) => ({
          batch_id: l.batch.batch_id,
          quantity: l.quantity,
          discount_percent: l.discount_percent ?? 0,
        })),
      });
      if (print) {
        await window.pharmacy.print.invoice(sale.id);
      }
      onSaved(`Invoice ${sale.invoice_no} saved.`);
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="New Sale"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-secondary"
            disabled={busy || !canWrite}
            onClick={() => checkout(false)}
          >
            Save
          </button>
          <button
            className="btn-primary"
            disabled={busy || !canWrite}
            onClick={() => checkout(true)}
          >
            Save & Print
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Customer</label>
          <select
            className="input"
            value={customerId ?? ''}
            onChange={(e) =>
              setCustomerId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Walk-in Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <label className="label">Add Item</label>
          <input
            ref={searchRef}
            className="input"
            placeholder="Scan barcode or search medicine / batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length && setShowResults(true)}
          />
          {showResults && results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <button
                  key={r.batch_id}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-brand-50"
                  onClick={() => addToCart(r)}
                >
                  <div>
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">
                      Batch {r.batch_no} · Exp {formatDate(r.expiry_date)} · Stock{' '}
                      {r.quantity_in_stock}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{inr(r.sale_price)}</div>
                    <div className="text-xs text-slate-400">{r.gst_rate}% GST</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {cart.length === 0 ? (
          <EmptyState message="Cart is empty. Search and add medicines above." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Item</th>
                <th className="th text-center">Qty</th>
                <th className="th text-right">Rate</th>
                <th className="th text-center">Disc %</th>
                <th className="th text-right">Total</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l) => {
                const amounts = saleLineAmounts({
                  gross: l.batch.sale_price * l.quantity,
                  gst_rate: l.batch.gst_rate ?? 0,
                  discount_percent: l.discount_percent ?? 0,
                });
                return (
                <tr key={l.batch.batch_id} className="border-t border-slate-100">
                  <td className="td">
                    <div className="font-medium">{l.batch.name}</div>
                    <div className="text-xs text-slate-400">
                      Batch {l.batch.batch_no} · {l.batch.gst_rate}% GST
                    </div>
                  </td>
                  <td className="td text-center">
                    <input
                      type="number"
                      min={1}
                      max={l.batch.quantity_in_stock}
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(l.batch.batch_id, Number(e.target.value))
                      }
                      className="input w-16 px-2 py-1 text-center"
                    />
                  </td>
                  <td className="td text-right">{inr(l.batch.sale_price)}</td>
                  <td className="td text-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      className="input w-14 px-2 py-1 text-center"
                      value={l.discount_percent}
                      onChange={(e) =>
                        updateLineDiscount(
                          l.batch.batch_id,
                          Number(e.target.value)
                        )
                      }
                    />
                  </td>
                  <td className="td text-right font-medium">
                    {inr(amounts.gross)}
                  </td>
                  <td className="td text-right">
                    <button
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeLine(l.batch.batch_id)}
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

        <div className="ml-auto w-64 space-y-1 text-sm">
          {totals.discountAmount > 0 && (
            <Row label="Discount" value={`- ${inr(totals.discountAmount)}`} />
          )}
          <Row label="Taxable Value" value={inr(totals.subtotal)} />
          <Row label="CGST" value={inr(totals.cgst)} />
          <Row label="SGST" value={inr(totals.sgst)} />
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
            <span>Total</span>
            <span className="text-brand-700">{inr(totals.total)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SaleEditForm({
  sale,
  onClose,
  onSaved,
  onError,
}: {
  sale: SaleWithItems;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(sale.customer_id);
  const [cart, setCart] = useState<CartLine[] | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SellableBatch[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const originalQty = useMemo(() => {
    const map: Record<number, number> = {};
    for (const it of sale.items) {
      if (it.batch_id != null) {
        map[it.batch_id] = (map[it.batch_id] ?? 0) + it.quantity;
      }
    }
    return map;
  }, [sale.items]);

  const availableStock = (batch: SellableBatch) =>
    batch.quantity_in_stock + (originalQty[batch.batch_id] ?? 0);

  useEffect(() => {
    window.pharmacy.customers.list().then(setCustomers);

    let cancelled = false;

    async function initCart() {
      const lines: CartLine[] = [];
      const byMedicine = new Map<number, Batch[]>();
      const legacyInvoiceDisc =
        (sale.discount_percent ?? 0) > 0 &&
        sale.items.every((row) => !(row.discount_percent ?? 0));

      for (const it of sale.items) {
        if (it.batch_id == null) continue;
        let batches = byMedicine.get(it.medicine_id);
        if (!batches) {
          batches = await window.pharmacy.batches.listByMedicine(it.medicine_id);
          byMedicine.set(it.medicine_id, batches);
        }
        const batch = batches.find((b) => b.id === it.batch_id);
        if (!batch) {
          if (!cancelled) {
            onError(`Batch for ${it.medicine_name} no longer exists.`);
            onClose();
          }
          return;
        }
        const sellable: SellableBatch = {
          batch_id: batch.id,
          medicine_id: batch.medicine_id,
          name: it.medicine_name,
          batch_no: batch.batch_no,
          expiry_date: batch.expiry_date,
          sale_price: batch.sale_price,
          mrp: batch.mrp,
          gst_rate: it.gst_rate,
          hsn_code: it.hsn_code,
          quantity_in_stock: batch.quantity_in_stock,
        };
        const lineDisc = legacyInvoiceDisc
          ? sale.discount_percent
          : (it.discount_percent ?? 0);
        const existing = lines.find((l) => l.batch.batch_id === it.batch_id);
        if (existing) existing.quantity += it.quantity;
        else lines.push({ batch: sellable, quantity: it.quantity, discount_percent: lineDisc });
      }
      if (!cancelled) setCart(lines);
    }

    initCart();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-init when the edited sale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      window.pharmacy.sales.searchSellable(search).then((r) => {
        setResults(r);
        setShowResults(true);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  const addToCart = (batch: SellableBatch) => {
    const max = availableStock(batch);
    if (max <= 0) return;
    setCart((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((l) => l.batch.batch_id === batch.batch_id);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = {
          ...copy[idx],
          quantity: Math.min(copy[idx].quantity + 1, max),
        };
        return copy;
      }
      return [...list, { batch, quantity: 1, discount_percent: 0 }];
    });
    setSearch('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  };

  const updateLine = (batchId: number, quantity: number) => {
    setCart((prev) =>
      (prev ?? []).map((l) => {
        if (l.batch.batch_id !== batchId) return l;
        const max = availableStock(l.batch);
        return { ...l, quantity: Math.max(1, Math.min(quantity, max)) };
      })
    );
  };

  const updateLineDiscount = (batchId: number, discount_percent: number) => {
    setCart((prev) =>
      (prev ?? []).map((l) =>
        l.batch.batch_id === batchId
          ? { ...l, discount_percent: Math.min(100, Math.max(0, discount_percent)) }
          : l
      )
    );
  };

  const removeLine = (batchId: number) => {
    setCart((prev) => (prev ?? []).filter((l) => l.batch.batch_id !== batchId));
  };

  const totals = useMemo(() => {
    if (!cart) {
      return computeSaleInvoice([]);
    }
    const lines = cart.map((l) => ({
      gross: l.batch.sale_price * l.quantity,
      gst_rate: l.batch.gst_rate ?? 0,
      discount_percent: l.discount_percent ?? 0,
    }));
    return computeSaleInvoice(lines);
  }, [cart]);

  const save = async () => {
    if (!cart || cart.length === 0) return onError('Add at least one item.');
    for (const l of cart) {
      if ((l.discount_percent ?? 0) < 0 || (l.discount_percent ?? 0) > 100) {
        return onError(`Discount must be 0–100% for ${l.batch.name}.`);
      }
    }
    setBusy(true);
    try {
      await window.pharmacy.sales.update(sale.id, {
        customer_id: customerId,
        items: cart.map((l) => ({
          batch_id: l.batch.batch_id,
          quantity: l.quantity,
          discount_percent: l.discount_percent ?? 0,
        })),
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
      title={`Edit Invoice ${sale.invoice_no}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy || !cart}>
            Update Invoice
          </button>
        </>
      }
    >
      {!cart ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Customer</label>
            <select
              className="input"
              value={customerId ?? ''}
              onChange={(e) =>
                setCustomerId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Walk-in Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="label">Add Item</label>
            <input
              ref={searchRef}
              className="input"
              placeholder="Search medicine / batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => results.length && setShowResults(true)}
            />
            {showResults && results.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((r) => {
                  const avail = availableStock(r);
                  return (
                    <button
                      key={r.batch_id}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-brand-50 disabled:opacity-50"
                      disabled={avail <= 0}
                      onClick={() => addToCart(r)}
                    >
                      <div>
                        <div className="font-medium text-slate-800">{r.name}</div>
                        <div className="text-xs text-slate-400">
                          Batch {r.batch_no} · Exp {formatDate(r.expiry_date)} · Avail{' '}
                          {avail}
                        </div>
                      </div>
                      <div className="font-semibold">{inr(r.sale_price)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <EmptyState message="No items on invoice." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Item</th>
                  <th className="th text-center">Qty</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-center">Disc %</th>
                  <th className="th text-right">Total</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => {
                  const max = availableStock(l.batch);
                  const amounts = saleLineAmounts({
                    gross: l.batch.sale_price * l.quantity,
                    gst_rate: l.batch.gst_rate ?? 0,
                    discount_percent: l.discount_percent ?? 0,
                  });
                  return (
                    <tr key={l.batch.batch_id} className="border-t border-slate-100">
                      <td className="td">
                        <div className="font-medium">{l.batch.name}</div>
                        <div className="text-xs text-slate-400">
                          Batch {l.batch.batch_no} · avail {max}
                        </div>
                      </td>
                      <td className="td text-center">
                        <input
                          type="number"
                          min={1}
                          max={max}
                          className="input w-16 px-2 py-1 text-center"
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.batch.batch_id, Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="td text-right">{inr(l.batch.sale_price)}</td>
                      <td className="td text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          className="input w-14 px-2 py-1 text-center"
                          value={l.discount_percent}
                          onChange={(e) =>
                            updateLineDiscount(
                              l.batch.batch_id,
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                      <td className="td text-right font-medium">
                        {inr(amounts.gross)}
                      </td>
                      <td className="td text-right">
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => removeLine(l.batch.batch_id)}
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

          <div className="ml-auto w-64 space-y-1 text-sm">
            {totals.discountAmount > 0 && (
              <Row label="Discount" value={`- ${inr(totals.discountAmount)}`} />
            )}
            <Row label="Taxable Value" value={inr(totals.subtotal)} />
            <Row label="CGST" value={inr(totals.cgst)} />
            <Row label="SGST" value={inr(totals.sgst)} />
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
              <span>Total</span>
              <span className="text-brand-700">{inr(totals.total)}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
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
