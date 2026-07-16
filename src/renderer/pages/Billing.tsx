import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SellableBatch, Customer } from '../../shared/types';
import { inr, formatDate } from '../lib/format';
import { useToast, errMsg, EmptyState } from '../components/ui';

interface CartLine {
  batch: SellableBatch;
  quantity: number;
  discount: number;
}

export function Billing() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SellableBatch[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [overallDiscount, setOverallDiscount] = useState(0);
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
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.batch.batch_id === batch.batch_id);
      if (idx >= 0) {
        const copy = [...prev];
        const nextQty = Math.min(copy[idx].quantity + 1, batch.quantity_in_stock);
        copy[idx] = { ...copy[idx], quantity: nextQty };
        return copy;
      }
      return [...prev, { batch, quantity: 1, discount: 0 }];
    });
    setSearch('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  };

  const updateLine = (batchId: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((l) => (l.batch.batch_id === batchId ? { ...l, ...patch } : l))
    );
  };

  const removeLine = (batchId: number) => {
    setCart((prev) => prev.filter((l) => l.batch.batch_id !== batchId));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let gross = 0;
    for (const l of cart) {
      const lineGross = l.batch.sale_price * l.quantity - l.discount;
      const rate = l.batch.gst_rate ?? 0;
      const taxable = rate > 0 ? lineGross / (1 + rate / 100) : lineGross;
      const tax = lineGross - taxable;
      subtotal += taxable;
      cgst += tax / 2;
      sgst += tax / 2;
      gross += lineGross;
    }
    const total = gross - overallDiscount;
    return { subtotal, cgst, sgst, total: total < 0 ? 0 : total };
  }, [cart, overallDiscount]);

  const checkout = async (print: boolean) => {
    if (cart.length === 0) {
      toast.error('Add at least one item.');
      return;
    }
    setBusy(true);
    try {
      const sale = await window.pharmacy.sales.create({
        customer_id: customerId,
        overall_discount: overallDiscount,
        items: cart.map((l) => ({
          batch_id: l.batch.batch_id,
          quantity: l.quantity,
          discount: l.discount,
        })),
      });
      toast.success(`Invoice ${sale.invoice_no} saved.`);
      if (print) {
        await window.pharmacy.print.invoice(sale.id);
      }
      setCart([]);
      setOverallDiscount(0);
      setCustomerId(null);
      searchRef.current?.focus();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Billing</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: search + cart */}
        <div className="space-y-4 lg:col-span-2">
          <div className="relative">
            <input
              ref={searchRef}
              className="input"
              placeholder="Scan barcode or search medicine / batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => results.length && setShowResults(true)}
            />
            {showResults && results.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
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

          <div className="card overflow-hidden">
            {cart.length === 0 ? (
              <EmptyState message="Cart is empty. Search and add medicines above." />
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th text-center">Qty</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Disc</th>
                    <th className="th text-right">Total</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l) => {
                    const lineTotal = l.batch.sale_price * l.quantity - l.discount;
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
                              updateLine(l.batch.batch_id, {
                                quantity: Math.max(
                                  1,
                                  Math.min(
                                    Number(e.target.value),
                                    l.batch.quantity_in_stock
                                  )
                                ),
                              })
                            }
                            className="input w-16 px-2 py-1 text-center"
                          />
                        </td>
                        <td className="td text-right">{inr(l.batch.sale_price)}</td>
                        <td className="td text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.discount}
                            onChange={(e) =>
                              updateLine(l.batch.batch_id, {
                                discount: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="input w-20 px-2 py-1 text-right"
                          />
                        </td>
                        <td className="td text-right font-medium">{inr(lineTotal)}</td>
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
          </div>
        </div>

        {/* Right: summary */}
        <div className="space-y-4">
          <div className="card p-4">
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

          <div className="card space-y-2 p-4">
            <Row label="Taxable Value" value={inr(totals.subtotal)} />
            <Row label="CGST" value={inr(totals.cgst)} />
            <Row label="SGST" value={inr(totals.sgst)} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Overall Discount</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(Math.max(0, Number(e.target.value)))}
                className="input w-28 px-2 py-1 text-right"
              />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-bold text-brand-700">
                {inr(totals.total)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => checkout(false)}
            >
              Save
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => checkout(true)}
            >
              Save & Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
