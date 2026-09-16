import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Customer, QuotationInput, QuotationWithItems } from '../../shared/types';
import {
  computeSaleInvoice,
  marginPercentFromRates,
  quotedRateFromCost,
  saleLineAmounts,
  saleRoundOff,
} from '../../shared/gst';
import { inr, formatDateTime, todayIso, monthStartIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg, NumberInput } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

const MARGIN_PRESETS = [0, 5, 8, 10, 12, 15, 16, 18, 20, 22, 25, 30, 35, 40, 50];

interface DraftLine {
  key: number;
  medicine_name: string;
  manufacturer: string;
  pack_size: string;
  hsn_code: string;
  quantity: number;
  mrp: number;
  cost_price: number;
  margin_percent: number;
  price: number;
  gst_rate: number;
  discount_percent: number;
}

let lineKey = 1;

function blankLine(marginPercent: number): DraftLine {
  return {
    key: lineKey++,
    medicine_name: '',
    manufacturer: '',
    pack_size: '',
    hsn_code: '',
    quantity: 1,
    mrp: 0,
    cost_price: 0,
    margin_percent: marginPercent,
    price: 0,
    gst_rate: 5,
    discount_percent: 0,
  };
}

function lineFromSaved(
  it: QuotationWithItems['items'][number]
): DraftLine {
  return {
    key: lineKey++,
    medicine_name: it.medicine_name,
    manufacturer: it.manufacturer ?? '',
    pack_size: it.pack_size ?? '',
    hsn_code: it.hsn_code ?? '',
    quantity: it.quantity,
    mrp: it.mrp ?? 0,
    cost_price: it.cost_price ?? 0,
    margin_percent: it.margin_percent ?? 0,
    price: it.price,
    gst_rate: it.gst_rate ?? 0,
    discount_percent: it.discount_percent ?? 0,
  };
}

function toInput(customerId: number | null, notes: string, lines: DraftLine[]): QuotationInput {
  return {
    customer_id: customerId,
    notes: notes.trim() || null,
    items: lines.map((l) => ({
      medicine_name: l.medicine_name.trim(),
      manufacturer: l.manufacturer.trim() || null,
      pack_size: l.pack_size.trim() || null,
      hsn_code: l.hsn_code.trim() || null,
      quantity: l.quantity,
      mrp: l.mrp,
      cost_price: l.cost_price,
      margin_percent: l.margin_percent,
      price: l.price,
      gst_rate: l.gst_rate,
      discount_percent: l.discount_percent,
    })),
  };
}

export function Quotations() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [quotations, setQuotations] = useState<QuotationWithItems[] | null>(null);
  const [selected, setSelected] = useState<QuotationWithItems | null>(null);
  const [editing, setEditing] = useState<QuotationWithItems | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    setQuotations(null);
    window.pharmacy.quotations.list(from, to).then(setQuotations);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const reprint = async (id: number) => {
    try {
      await window.pharmacy.print.quotation(id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const rangeTotal = quotations?.reduce((s, x) => s + x.total, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-4">
        <ReadOnlyNotice />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Quotations</h1>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            disabled={!canWrite}
          >
            + New Quotation
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
        {!quotations ? (
          <Spinner />
        ) : quotations.length === 0 ? (
          <EmptyState message="No quotations in the selected range." />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="th">Quotation</th>
                <th className="th">Date</th>
                <th className="th">Customer</th>
                <th className="th text-center">Items</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td font-medium">{q.quotation_no}</td>
                  <td className="td">{formatDateTime(q.quotation_date)}</td>
                  <td className="td">{q.customer_name || 'Customer'}</td>
                  <td className="td text-center">{q.items.length}</td>
                  <td className="td text-right font-medium">{inr(q.total)}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary px-2 py-1" onClick={() => setSelected(q)}>
                        View
                      </button>
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => {
                          setEditing(q);
                          setFormOpen(true);
                        }}
                        disabled={!canWrite}
                      >
                        Edit
                      </button>
                      <button className="btn-secondary px-2 py-1" onClick={() => reprint(q.id)}>
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
        title={selected ? `Quotation ${selected.quotation_no}` : ''}
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
                    const q = selected;
                    setSelected(null);
                    setEditing(q);
                    setFormOpen(true);
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
        {selected && <QuotationView quotation={selected} />}
      </Modal>

      {formOpen && (
        <QuotationForm
          initial={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setFormOpen(false);
            setEditing(null);
            load();
            toast.success(msg);
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

function QuotationView({ quotation }: { quotation: QuotationWithItems }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        <div>{formatDateTime(quotation.quotation_date)}</div>
        {quotation.customer_name ? (
          <>
            <div className="font-medium text-slate-800">{quotation.customer_name}</div>
            {quotation.customer_address && <div>{quotation.customer_address}</div>}
            {quotation.customer_phone && <div>Ph: {quotation.customer_phone}</div>}
            {quotation.customer_gstin && <div>GSTIN: {quotation.customer_gstin}</div>}
            {quotation.customer_pan && <div>PAN: {quotation.customer_pan}</div>}
            {quotation.customer_dl_no && <div>D.L. No: {quotation.customer_dl_no}</div>}
          </>
        ) : (
          <div>Customer</div>
        )}
        {quotation.notes && (
          <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-slate-700">
            {quotation.notes}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Item</th>
              <th className="th">Mfg</th>
              <th className="th">Pack</th>
              <th className="th">HSN</th>
              <th className="th text-right">MRP</th>
              <th className="th text-center">Qty</th>
              <th className="th text-right">Cost</th>
              <th className="th text-center">Margin %</th>
              <th className="th text-right">Rate</th>
              <th className="th text-center">Disc %</th>
              <th className="th text-right">Taxable</th>
              <th className="th text-center">GST %</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="td font-medium">{it.medicine_name}</td>
                <td className="td">{it.manufacturer || '-'}</td>
                <td className="td">{it.pack_size || '-'}</td>
                <td className="td">{it.hsn_code || '-'}</td>
                <td className="td text-right">{inr(it.mrp)}</td>
                <td className="td text-center">{it.quantity}</td>
                <td className="td text-right text-slate-500">{inr(it.cost_price)}</td>
                <td className="td text-center text-slate-500">{it.margin_percent}%</td>
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
      <p className="text-xs text-slate-400">Cost and margin % are internal and are not printed.</p>
      <div className="ml-auto w-64 space-y-1 text-sm">
        <Row label="Discount" value={`- ${inr(quotation.discount)}`} />
        <Row label="Taxable Value" value={inr(quotation.subtotal)} />
        <Row label="CGST" value={inr(quotation.cgst)} />
        <Row label="SGST" value={inr(quotation.sgst)} />
        <Row
          label="Round Off"
          value={`${saleRoundOff(quotation) >= 0 ? '+' : ''}${inr(saleRoundOff(quotation))}`}
        />
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
          <span>Net Amount</span>
          <span className="text-brand-700">{inr(quotation.total)}</span>
        </div>
      </div>
    </div>
  );
}

function QuotationForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: QuotationWithItems | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (m: string) => void;
}) {
  const canWrite = useWriteAllowed();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(initial?.customer_id ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [defaultMargin, setDefaultMargin] = useState(
    initial?.items[0]?.margin_percent ?? 20
  );
  const [lines, setLines] = useState<DraftLine[]>(
    initial?.items.length ? initial.items.map(lineFromSaved) : [blankLine(20)]
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.pharmacy.customers.list().then(setCustomers);
  }, []);

  const patch = (key: number, p: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...p };
        next.quantity = Math.max(1, next.quantity);
        next.mrp = Math.max(0, next.mrp);
        next.cost_price = Math.max(0, next.cost_price);
        next.margin_percent = Math.min(1000, Math.max(0, next.margin_percent));
        next.price = Math.max(0, next.price);
        next.gst_rate = Math.min(100, Math.max(0, next.gst_rate));
        next.discount_percent = Math.min(100, Math.max(0, next.discount_percent));
        return next;
      })
    );
  };

  const setCost = (key: number, cost_price: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const cost = Math.max(0, cost_price);
        return {
          ...l,
          cost_price: cost,
          price: cost > 0 ? quotedRateFromCost(cost, l.margin_percent) : l.price,
        };
      })
    );
  };

  const setMargin = (key: number, margin_percent: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const margin = Math.min(1000, Math.max(0, margin_percent));
        return {
          ...l,
          margin_percent: margin,
          price: l.cost_price > 0 ? quotedRateFromCost(l.cost_price, margin) : l.price,
        };
      })
    );
  };

  const setPrice = (key: number, price: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const rate = Math.max(0, price);
        return {
          ...l,
          price: rate,
          margin_percent:
            l.cost_price > 0 ? marginPercentFromRates(l.cost_price, rate) : l.margin_percent,
        };
      })
    );
  };

  const applyMarginToAll = (margin: number) => {
    setDefaultMargin(margin);
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        margin_percent: margin,
        price: l.cost_price > 0 ? quotedRateFromCost(l.cost_price, margin) : l.price,
      }))
    );
  };

  const addLine = () => setLines((prev) => [...prev, blankLine(defaultMargin)]);
  const removeLine = (key: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));

  const totals = useMemo(
    () =>
      computeSaleInvoice(
        lines.map((l) => ({
          gross: l.price * l.quantity,
          gst_rate: l.gst_rate ?? 0,
          discount_percent: l.discount_percent ?? 0,
        }))
      ),
    [lines]
  );

  const save = async (print: boolean) => {
    if (!canWrite) {
      onError('Quotations are disabled until the subscription is renewed.');
      return;
    }
    const filled = lines.filter((l) => l.medicine_name.trim());
    if (filled.length === 0) {
      onError('Add at least one medicine name.');
      return;
    }
    for (const l of filled) {
      if (l.quantity <= 0) {
        onError(`Quantity must be positive for ${l.medicine_name}.`);
        return;
      }
      if ((l.discount_percent ?? 0) < 0 || (l.discount_percent ?? 0) > 100) {
        onError(`Discount must be 0–100% for ${l.medicine_name}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload = toInput(customerId, notes, filled);
      const saved = initial
        ? await window.pharmacy.quotations.update(initial.id, payload)
        : await window.pharmacy.quotations.create(payload);
      if (print) {
        await window.pharmacy.print.quotation(saved.id);
      }
      onSaved(
        initial
          ? `Quotation ${saved.quotation_no} updated.`
          : `Quotation ${saved.quotation_no} saved.`
      );
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={initial ? `Edit Quotation ${initial.quotation_no}` : 'New Quotation'}
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
            onClick={() => save(false)}
          >
            Save
          </button>
          <button
            className="btn-primary"
            disabled={busy || !canWrite}
            onClick={() => save(true)}
          >
            Save & Print
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="grid shrink-0 grid-cols-3 gap-2">
          <div>
            <label className="label">Customer</label>
            <select
              className="input"
              value={customerId ?? ''}
              onChange={(e) =>
                setCustomerId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Customer (optional)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Default margin % (not printed)</label>
            <MarginSelect value={defaultMargin} onChange={applyMarginToAll} />
          </div>
          <div>
            <label className="label">Remarks (printed)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valid for 7 days / delivery terms…"
            />
          </div>
        </div>
        <p className="shrink-0 text-xs text-slate-500">
          Type the medicine name on each line. Cost and margin % stay on this screen only — the
          printed quotation shows the quoted rate, not the margin.
        </p>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1180px] text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="th">Medicine name</th>
                <th className="th">Mfg</th>
                <th className="th">Pack</th>
                <th className="th">HSN</th>
                <th className="th text-right">MRP</th>
                <th className="th text-center">Qty</th>
                <th className="th text-right">Cost</th>
                <th className="th text-center">Margin %</th>
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
                const amounts = saleLineAmounts({
                  gross: l.price * l.quantity,
                  gst_rate: l.gst_rate ?? 0,
                  discount_percent: l.discount_percent ?? 0,
                });
                return (
                  <tr key={l.key} className="border-t border-slate-100">
                    <td className="td">
                      <input
                        className="input w-40 px-1 py-0.5"
                        placeholder="Type medicine name"
                        value={l.medicine_name}
                        onChange={(e) => patch(l.key, { medicine_name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addLine();
                          }
                        }}
                      />
                    </td>
                    <td className="td">
                      <input
                        className="input w-20 px-1 py-0.5"
                        value={l.manufacturer}
                        onChange={(e) => patch(l.key, { manufacturer: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input
                        className="input w-14 px-1 py-0.5"
                        value={l.pack_size}
                        onChange={(e) => patch(l.key, { pack_size: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input
                        className="input w-16 px-1 py-0.5"
                        value={l.hsn_code}
                        onChange={(e) => patch(l.key, { hsn_code: e.target.value })}
                      />
                    </td>
                    <td className="td text-right">
                      <NumberInput
                        min={0}
                        step="0.01"
                        value={l.mrp}
                        onValueChange={(mrp) => patch(l.key, { mrp })}
                        className="input w-16 px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="td text-center">
                      <NumberInput
                        min={1}
                        value={l.quantity}
                        emptyValue={1}
                        onValueChange={(quantity) => patch(l.key, { quantity })}
                        className="input w-12 px-1 py-0.5 text-center"
                      />
                    </td>
                    <td className="td text-right">
                      <NumberInput
                        min={0}
                        step="0.01"
                        value={l.cost_price}
                        onValueChange={(cost_price) => setCost(l.key, cost_price)}
                        className="input w-16 px-1 py-0.5 text-right"
                        title="Internal cost — not printed"
                      />
                    </td>
                    <td className="td text-center">
                      <MarginSelect
                        value={l.margin_percent}
                        onChange={(margin) => setMargin(l.key, margin)}
                      />
                    </td>
                    <td className="td text-right">
                      <NumberInput
                        min={0}
                        step="0.01"
                        value={l.price}
                        onValueChange={(price) => setPrice(l.key, price)}
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
                          patch(l.key, { discount_percent })
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
                        onValueChange={(gst_rate) => patch(l.key, { gst_rate })}
                        className="input w-12 px-1 py-0.5 text-center"
                      />
                    </td>
                    <td className="td text-right font-medium whitespace-nowrap">
                      {inr(amounts.gross)}
                    </td>
                    <td className="td text-right">
                      <button
                        className="text-red-500 hover:text-red-700"
                        onClick={() => removeLine(l.key)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 pt-2">
          <button className="btn-secondary px-2 py-1" type="button" onClick={addLine}>
            + Add line
          </button>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm">
            <span className="text-slate-600">
              Discount:{' '}
              <span className="font-medium text-slate-800">- {inr(totals.discountAmount)}</span>
            </span>
            <span className="text-slate-600">
              Taxable:{' '}
              <span className="font-medium text-slate-800">{inr(totals.subtotal)}</span>
            </span>
            <span className="text-slate-600">
              CGST: <span className="font-medium text-slate-800">{inr(totals.cgst)}</span>
            </span>
            <span className="text-slate-600">
              SGST: <span className="font-medium text-slate-800">{inr(totals.sgst)}</span>
            </span>
            <span className="text-slate-600">
              Round Off:{' '}
              <span className="font-medium text-slate-800">
                {totals.roundOff >= 0 ? '+' : ''}
                {inr(totals.roundOff)}
              </span>
            </span>
            <span className="font-semibold text-slate-800">
              Net: <span className="text-brand-700">{inr(totals.total)}</span>
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MarginSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const matched = MARGIN_PRESETS.find((p) => Math.abs(p - value) < 0.001);
  const [forceOther, setForceOther] = useState(false);
  const showOther = forceOther || matched == null;
  return (
    <div className="flex items-center justify-center gap-1">
      <select
        className="input w-[4.75rem] px-1 py-0.5"
        title="Internal margin — not printed"
        value={showOther ? '__other__' : String(matched)}
        onChange={(e) => {
          if (e.target.value === '__other__') {
            setForceOther(true);
            return;
          }
          setForceOther(false);
          onChange(Number(e.target.value));
        }}
      >
        {MARGIN_PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}%
          </option>
        ))}
        <option value="__other__">Other</option>
      </select>
      {showOther && (
        <NumberInput
          min={0}
          max={1000}
          step="0.1"
          value={value}
          onValueChange={(n) => {
            setForceOther(true);
            onChange(n);
          }}
          className="input w-14 px-1 py-0.5 text-center"
          title="Custom margin % — not printed"
        />
      )}
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
