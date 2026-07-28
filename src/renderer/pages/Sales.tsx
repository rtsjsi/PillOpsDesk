import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  SaleWithItems,
  Customer,
  SellableBatch,
  Batch,
} from '../../shared/types';
import { computeSaleInvoice, saleLineAmounts } from '../../shared/gst';
import { inr, formatDateTime, formatExpiry, todayIso, monthStartIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg, NumberInput } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

interface CartLine {
  batch: SellableBatch;
  quantity: number;
  free_quantity: number;
  discount_percent: number;
  scheme: string;
  /** Editable unit rate (defaults to batch sale_price). */
  rate: number;
  /** Editable line overrides (default from medicine/batch). */
  hsn_code: string;
  mrp: number;
  gst_rate: number;
}

function cartLineFromBatch(batch: SellableBatch, overrides?: Partial<CartLine>): CartLine {
  return {
    batch,
    quantity: 1,
    free_quantity: 0,
    discount_percent: 0,
    scheme: '',
    rate: batch.sale_price,
    hsn_code: batch.hsn_code ?? '',
    mrp: batch.mrp,
    gst_rate: batch.gst_rate ?? 0,
    ...overrides,
  };
}

function lineStockOut(l: CartLine): number {
  return l.quantity + Math.max(0, l.free_quantity);
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-4">
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
      </div>

      <div className="card min-h-0 flex-1 overflow-auto">
        {!sales ? (
          <Spinner />
        ) : sales.length === 0 ? (
          <EmptyState message="No sales in the selected range." />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50">
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
              <div className="space-y-0.5">
                <div>{formatDateTime(selected.sale_date)}</div>
                {selected.customer_name ? (
                  <>
                    <div className="font-medium text-slate-800">{selected.customer_name}</div>
                    {selected.customer_address && <div>{selected.customer_address}</div>}
                    {selected.customer_phone && <div>Ph: {selected.customer_phone}</div>}
                    {selected.customer_gstin && <div>GSTIN: {selected.customer_gstin}</div>}
                  </>
                ) : (
                  <div>Walk-in Customer</div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th">Mfg</th>
                    <th className="th">Pack</th>
                    <th className="th">HSN</th>
                    <th className="th">Batch</th>
                    <th className="th">Exp</th>
                    <th className="th text-right">MRP</th>
                    <th className="th text-center">Qty</th>
                    <th className="th text-center">Free</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-center">Disc %</th>
                    <th className="th text-right">Taxable</th>
                    <th className="th text-center">GST %</th>
                    <th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="td font-medium">{it.medicine_name}</td>
                      <td className="td">{it.manufacturer || '-'}</td>
                      <td className="td">{it.pack_size || '-'}</td>
                      <td className="td">{it.hsn_code || '-'}</td>
                      <td className="td">{it.batch_no}</td>
                      <td className="td">
                        {it.expiry_date ? formatExpiry(it.expiry_date) : '-'}
                      </td>
                      <td className="td text-right">{inr(it.mrp)}</td>
                      <td className="td text-center">{it.quantity}</td>
                      <td className="td text-center">{it.free_quantity || '-'}</td>
                      <td className="td text-right">{inr(it.price)}</td>
                      <td className="td text-center">
                        {it.discount_percent > 0 ? `${it.discount_percent}%` : '-'}
                      </td>
                      <td className="td text-right">{inr(it.taxable_value)}</td>
                      <td className="td text-center">{it.gst_rate}%</td>
                      <td className="td text-right font-medium">{inr(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-64 space-y-1 text-sm">
              <Row label="Discount" value={`- ${inr(selected.discount)}`} />
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
        const nextQty = Math.min(
          copy[idx].quantity + 1,
          batch.quantity_in_stock - copy[idx].free_quantity
        );
        if (nextQty < 1) return prev;
        copy[idx] = { ...copy[idx], quantity: nextQty };
        return copy;
      }
      return [...prev, cartLineFromBatch(batch)];
    });
    setSearch('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  };

  const patchLine = (batchId: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.batch.batch_id !== batchId) return l;
        const next = { ...l, ...patch };
        const max = l.batch.quantity_in_stock;
        const free = Math.max(0, next.free_quantity);
        const qty = Math.max(1, Math.min(next.quantity, Math.max(1, max - free)));
        return {
          ...next,
          free_quantity: Math.min(free, Math.max(0, max - qty)),
          quantity: qty,
          discount_percent: Math.min(100, Math.max(0, next.discount_percent)),
          rate: Math.max(0, next.rate),
          mrp: Math.max(0, next.mrp),
          gst_rate: Math.min(100, Math.max(0, next.gst_rate)),
          hsn_code: next.hsn_code,
        };
      })
    );
  };

  const removeLine = (batchId: number) => {
    setCart((prev) => prev.filter((l) => l.batch.batch_id !== batchId));
  };

  const totals = useMemo(() => {
    return computeSaleInvoice(
      cart.map((l) => ({
        gross: l.rate * l.quantity,
        gst_rate: l.gst_rate ?? 0,
        discount_percent: l.discount_percent ?? 0,
      }))
    );
  }, [cart]);

  const checkout = async (print: boolean) => {
    if (cart.length === 0) {
      onError('Add at least one item.');
      return;
    }
    for (const l of cart) {
      if (l.quantity <= 0) {
        onError(`Quantity must be positive for ${l.batch.name}.`);
        return;
      }
      if (lineStockOut(l) > l.batch.quantity_in_stock) {
        onError(`Not enough stock for ${l.batch.name}.`);
        return;
      }
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
          free_quantity: l.free_quantity,
          discount_percent: l.discount_percent ?? 0,
          scheme: l.scheme.trim() || null,
          price: l.rate,
          hsn_code: l.hsn_code.trim() || null,
          mrp: l.mrp,
          gst_rate: l.gst_rate,
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
      xl
      bodyScroll={false}
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
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="grid shrink-0 grid-cols-2 gap-2">
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
                        Batch {r.batch_no} · Exp {formatExpiry(r.expiry_date)} · Stock{' '}
                        {r.quantity_in_stock}
                        {r.manufacturer ? ` · ${r.manufacturer}` : ''}
                        {r.pack_size ? ` · Pack ${r.pack_size}` : ''}
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
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
          {cart.length === 0 ? (
            <EmptyState message="Cart is empty. Search and add medicines above." />
          ) : (
            <SaleCartTable
              lines={cart}
              maxFor={(l) => l.batch.quantity_in_stock}
              onPatch={patchLine}
              onRemove={removeLine}
            />
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-slate-200 pt-2 text-sm">
          <span className="text-slate-600">
            Discount:{' '}
            <span className="font-medium text-slate-800">
              - {inr(totals.discountAmount)}
            </span>
          </span>
          <span className="text-slate-600">
            Taxable:{' '}
            <span className="font-medium text-slate-800">{inr(totals.subtotal)}</span>
          </span>
          <span className="text-slate-600">
            CGST:{' '}
            <span className="font-medium text-slate-800">{inr(totals.cgst)}</span>
          </span>
          <span className="text-slate-600">
            SGST:{' '}
            <span className="font-medium text-slate-800">{inr(totals.sgst)}</span>
          </span>
          <span className="font-semibold text-slate-800">
            Total:{' '}
            <span className="text-brand-700">{inr(totals.total)}</span>
          </span>
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

  const originalStockOut = useMemo(() => {
    const map: Record<number, number> = {};
    for (const it of sale.items) {
      if (it.batch_id != null) {
        map[it.batch_id] =
          (map[it.batch_id] ?? 0) + it.quantity + Math.max(0, it.free_quantity ?? 0);
      }
    }
    return map;
  }, [sale.items]);

  const availableStock = (batch: SellableBatch) =>
    batch.quantity_in_stock + (originalStockOut[batch.batch_id] ?? 0);

  useEffect(() => {
    window.pharmacy.customers.list().then(setCustomers);

    let cancelled = false;

    async function initCart() {
      const lines: CartLine[] = [];
      const byMedicine = new Map<number, Batch[]>();
      const medicineCache = new Map<number, Awaited<ReturnType<typeof window.pharmacy.medicines.get>>>();
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

        let med = medicineCache.get(it.medicine_id);
        if (med === undefined) {
          med = await window.pharmacy.medicines.get(it.medicine_id);
          medicineCache.set(it.medicine_id, med);
        }

        const sellable: SellableBatch = {
          batch_id: batch.id,
          medicine_id: batch.medicine_id,
          name: it.medicine_name,
          batch_no: batch.batch_no,
          expiry_date: it.expiry_date || batch.expiry_date,
          sale_price: batch.sale_price,
          mrp: it.mrp > 0 ? it.mrp : batch.mrp,
          gst_rate: it.gst_rate,
          hsn_code: it.hsn_code ?? med?.hsn_code ?? null,
          manufacturer: it.manufacturer ?? med?.manufacturer ?? null,
          pack_size: it.pack_size ?? med?.pack_size ?? null,
          rack: it.rack ?? med?.rack ?? null,
          quantity_in_stock: batch.quantity_in_stock,
        };
        const lineDisc = legacyInvoiceDisc
          ? sale.discount_percent
          : (it.discount_percent ?? 0);
        const existing = lines.find((l) => l.batch.batch_id === it.batch_id);
        if (existing) {
          existing.quantity += it.quantity;
          existing.free_quantity += Math.max(0, it.free_quantity ?? 0);
        } else {
          lines.push(
            cartLineFromBatch(sellable, {
              quantity: it.quantity,
              free_quantity: Math.max(0, it.free_quantity ?? 0),
              discount_percent: lineDisc,
              scheme: it.scheme ?? '',
              rate: it.price,
              hsn_code: it.hsn_code ?? '',
              mrp: it.mrp > 0 ? it.mrp : batch.mrp,
              gst_rate: it.gst_rate,
            })
          );
        }
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
        const nextQty = Math.min(
          copy[idx].quantity + 1,
          max - copy[idx].free_quantity
        );
        if (nextQty < 1) return list;
        copy[idx] = { ...copy[idx], quantity: nextQty };
        return copy;
      }
      return [...list, cartLineFromBatch(batch)];
    });
    setSearch('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  };

  const patchLine = (batchId: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      (prev ?? []).map((l) => {
        if (l.batch.batch_id !== batchId) return l;
        const next = { ...l, ...patch };
        const max = availableStock(l.batch);
        const free = Math.max(0, next.free_quantity);
        const qty = Math.max(1, Math.min(next.quantity, Math.max(1, max - free)));
        return {
          ...next,
          free_quantity: Math.min(free, Math.max(0, max - qty)),
          quantity: qty,
          discount_percent: Math.min(100, Math.max(0, next.discount_percent)),
          rate: Math.max(0, next.rate),
          mrp: Math.max(0, next.mrp),
          gst_rate: Math.min(100, Math.max(0, next.gst_rate)),
          hsn_code: next.hsn_code,
        };
      })
    );
  };

  const removeLine = (batchId: number) => {
    setCart((prev) => (prev ?? []).filter((l) => l.batch.batch_id !== batchId));
  };

  const totals = useMemo(() => {
    if (!cart) return computeSaleInvoice([]);
    return computeSaleInvoice(
      cart.map((l) => ({
        gross: l.rate * l.quantity,
        gst_rate: l.gst_rate ?? 0,
        discount_percent: l.discount_percent ?? 0,
      }))
    );
  }, [cart]);

  const save = async () => {
    if (!cart || cart.length === 0) return onError('Add at least one item.');
    for (const l of cart) {
      if (l.quantity <= 0) {
        return onError(`Quantity must be positive for ${l.batch.name}.`);
      }
      if (lineStockOut(l) > availableStock(l.batch)) {
        return onError(`Not enough stock for ${l.batch.name}.`);
      }
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
          free_quantity: l.free_quantity,
          discount_percent: l.discount_percent ?? 0,
          scheme: l.scheme.trim() || null,
          price: l.rate,
          hsn_code: l.hsn_code.trim() || null,
          mrp: l.mrp,
          gst_rate: l.gst_rate,
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
      xl
      bodyScroll={false}
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
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="grid shrink-0 grid-cols-2 gap-2">
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
                            Batch {r.batch_no} · Exp {formatExpiry(r.expiry_date)} · Avail{' '}
                            {avail}
                            {r.manufacturer ? ` · ${r.manufacturer}` : ''}
                          </div>
                        </div>
                        <div className="font-semibold">{inr(r.sale_price)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
            {cart.length === 0 ? (
              <EmptyState message="No items on invoice." />
            ) : (
              <SaleCartTable
                lines={cart}
                maxFor={(l) => availableStock(l.batch)}
                onPatch={patchLine}
                onRemove={removeLine}
              />
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-slate-200 pt-2 text-sm">
            <span className="text-slate-600">
              Discount:{' '}
              <span className="font-medium text-slate-800">
                - {inr(totals.discountAmount)}
              </span>
            </span>
            <span className="text-slate-600">
              Taxable:{' '}
              <span className="font-medium text-slate-800">{inr(totals.subtotal)}</span>
            </span>
            <span className="text-slate-600">
              CGST:{' '}
              <span className="font-medium text-slate-800">{inr(totals.cgst)}</span>
            </span>
            <span className="text-slate-600">
              SGST:{' '}
              <span className="font-medium text-slate-800">{inr(totals.sgst)}</span>
            </span>
            <span className="font-semibold text-slate-800">
              Total:{' '}
              <span className="text-brand-700">{inr(totals.total)}</span>
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SaleCartTable({
  lines,
  maxFor,
  onPatch,
  onRemove,
}: {
  lines: CartLine[];
  maxFor: (l: CartLine) => number;
  onPatch: (batchId: number, patch: Partial<CartLine>) => void;
  onRemove: (batchId: number) => void;
}) {
  return (
    <table className="w-full min-w-[980px] text-xs">
      <thead className="sticky top-0 z-10 bg-slate-50">
        <tr>
          <th className="th">Item</th>
          <th className="th">Mfg</th>
          <th className="th">Pack</th>
          <th className="th">HSN</th>
          <th className="th">Batch</th>
          <th className="th">Exp</th>
          <th className="th text-right">MRP</th>
          <th className="th text-center">Qty</th>
          <th className="th text-center">Free</th>
          <th className="th text-right">Rate</th>
          <th className="th text-center">Disc %</th>
          <th className="th text-right">Taxable</th>
          <th className="th text-center">GST %</th>
          <th className="th text-right">Amount</th>
          <th className="th"></th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const max = maxFor(l);
          const amounts = saleLineAmounts({
            gross: l.rate * l.quantity,
            gst_rate: l.gst_rate ?? 0,
            discount_percent: l.discount_percent ?? 0,
          });
          return (
            <tr key={l.batch.batch_id} className="border-t border-slate-100">
              <td className="td">
                <div className="max-w-[140px] font-medium text-slate-800">{l.batch.name}</div>
                <div className="text-[10px] text-slate-400">Avail {max}</div>
              </td>
              <td className="td max-w-[90px] truncate" title={l.batch.manufacturer ?? undefined}>
                {l.batch.manufacturer || '-'}
              </td>
              <td className="td whitespace-nowrap">{l.batch.pack_size || '-'}</td>
              <td className="td">
                <input
                  type="text"
                  value={l.hsn_code}
                  onChange={(e) => onPatch(l.batch.batch_id, { hsn_code: e.target.value })}
                  className="input w-16 px-1 py-0.5"
                  placeholder="HSN"
                />
              </td>
              <td className="td whitespace-nowrap">{l.batch.batch_no}</td>
              <td className="td whitespace-nowrap">{formatExpiry(l.batch.expiry_date)}</td>
              <td className="td text-right">
                <NumberInput
                  min={0}
                  step="0.01"
                  value={l.mrp}
                  onValueChange={(mrp) => onPatch(l.batch.batch_id, { mrp })}
                  className="input w-16 px-1 py-0.5 text-right"
                />
              </td>
              <td className="td text-center">
                <NumberInput
                  min={1}
                  max={Math.max(1, max - l.free_quantity)}
                  value={l.quantity}
                  emptyValue={1}
                  onValueChange={(quantity) => onPatch(l.batch.batch_id, { quantity })}
                  className="input w-12 px-1 py-0.5 text-center"
                />
              </td>
              <td className="td text-center">
                <NumberInput
                  min={0}
                  max={Math.max(0, max - l.quantity)}
                  value={l.free_quantity}
                  onValueChange={(free_quantity) =>
                    onPatch(l.batch.batch_id, { free_quantity: Math.max(0, free_quantity) })
                  }
                  className="input w-12 px-1 py-0.5 text-center"
                />
              </td>
              <td className="td text-right">
                <NumberInput
                  min={0}
                  step="0.01"
                  value={l.rate}
                  onValueChange={(rate) => onPatch(l.batch.batch_id, { rate })}
                  className="input w-16 px-1 py-0.5 text-right"
                />
              </td>
              <td className="td text-center">
                <NumberInput
                  min={0}
                  max={100}
                  step="0.1"
                  value={l.discount_percent}
                  onValueChange={(discount_percent) =>
                    onPatch(l.batch.batch_id, { discount_percent })
                  }
                  className="input w-12 px-1 py-0.5 text-center"
                />
              </td>
              <td className="td text-right whitespace-nowrap">{inr(amounts.taxable)}</td>
              <td className="td text-center">
                <NumberInput
                  min={0}
                  max={100}
                  step="0.1"
                  value={l.gst_rate}
                  onValueChange={(gst_rate) => onPatch(l.batch.batch_id, { gst_rate })}
                  className="input w-12 px-1 py-0.5 text-center"
                />
              </td>
              <td className="td text-right font-medium whitespace-nowrap">{inr(amounts.gross)}</td>
              <td className="td text-right">
                <button
                  className="text-red-500 hover:text-red-700"
                  onClick={() => onRemove(l.batch.batch_id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
