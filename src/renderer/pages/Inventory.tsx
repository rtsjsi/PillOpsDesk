import React, { useCallback, useEffect, useState } from 'react';
import type { Medicine, MedicineInput, MedicineSchedule, MedicineStorageType, Batch, BatchInput } from '../../shared/types';
import { inr, formatDate, daysUntil, todayIso } from '../lib/format';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, Badge, useToast, errMsg } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

const GST_RATES = [0, 5, 12, 18, 28];

const SCHEDULE_OPTIONS: { value: MedicineSchedule | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'OTC', label: 'OTC (over the counter)' },
  { value: 'H', label: 'Schedule H (Rx)' },
  { value: 'H1', label: 'Schedule H1 (Rx + record)' },
  { value: 'X', label: 'Schedule X (controlled)' },
];

const STORAGE_OPTIONS: { value: MedicineStorageType | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'room', label: 'Room temperature' },
  { value: 'refrigerated', label: 'Refrigerated' },
];

function scheduleLabel(schedule: MedicineSchedule | null | undefined): string {
  return SCHEDULE_OPTIONS.find((o) => o.value === schedule)?.label ?? '-';
}

function storageLabel(storage: MedicineStorageType | null | undefined): string {
  return STORAGE_OPTIONS.find((o) => o.value === storage)?.label ?? '-';
}

const emptyMedicine: MedicineInput = {
  name: '',
  generic_name: '',
  manufacturer: '',
  hsn_code: '',
  gst_rate: 12,
  category: '',
  pack_size: '',
  schedule: null,
  storage_type: null,
  rack: '',
  reorder_level: 10,
};

export function Inventory() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const [search, setSearch] = useState('');
  const [meds, setMeds] = useState<Medicine[] | null>(null);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});

  const [medModal, setMedModal] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [viewing, setViewing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<MedicineInput>(emptyMedicine);

  const [batchMed, setBatchMed] = useState<Medicine | null>(null);

  const load = useCallback(async () => {
    const [list, stock] = await Promise.all([
      window.pharmacy.medicines.list(search),
      window.pharmacy.batches.stock(),
    ]);
    const map: Record<number, number> = {};
    for (const s of stock) {
      map[s.medicine_id] = (map[s.medicine_id] ?? 0) + s.quantity_in_stock;
    }
    setStockMap(map);
    setMeds(list);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyMedicine);
    setMedModal(true);
  };

  const openEdit = (m: Medicine) => {
    setEditing(m);
    setForm({
      name: m.name,
      generic_name: m.generic_name ?? '',
      manufacturer: m.manufacturer ?? '',
      hsn_code: m.hsn_code ?? '',
      gst_rate: m.gst_rate,
      category: m.category ?? '',
      pack_size: m.pack_size ?? '',
      schedule: m.schedule,
      storage_type: m.storage_type,
      rack: m.rack ?? '',
      reorder_level: m.reorder_level,
    });
    setMedModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Medicine name is required.');
      return;
    }
    try {
      if (editing) {
        await window.pharmacy.medicines.update(editing.id, form);
        toast.success('Medicine updated.');
      } else {
        await window.pharmacy.medicines.create(form);
        toast.success('Medicine added.');
      }
      setMedModal(false);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (m: Medicine) => {
    if (!confirm(`Remove "${m.name}"? It will be hidden from lists.`)) return;
    try {
      await window.pharmacy.medicines.remove(m.id);
      toast.success('Medicine removed.');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-4">
      <ReadOnlyNotice />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
        <button className="btn-primary" onClick={openNew} disabled={!canWrite}>
          + Add Medicine
        </button>
      </div>

      <input
        className="input max-w-md"
        placeholder="Search by name, salt, or manufacturer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-hidden">
        {!meds ? (
          <Spinner />
        ) : meds.length === 0 ? (
          <EmptyState message="No medicines found. Add one to get started." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Medicine</th>
                <th className="th">Manufacturer</th>
                <th className="th">Pack</th>
                <th className="th">Schedule</th>
                <th className="th">HSN</th>
                <th className="th text-center">GST</th>
                <th className="th text-center">Rack</th>
                <th className="th text-center">Stock</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meds.map((m) => {
                const stock = stockMap[m.id] ?? 0;
                return (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="td">
                      <div className="font-medium text-slate-800">{m.name}</div>
                      {m.generic_name && (
                        <div className="text-xs text-slate-400">{m.generic_name}</div>
                      )}
                    </td>
                    <td className="td">{m.manufacturer || '-'}</td>
                    <td className="td">{m.pack_size || '-'}</td>
                    <td className="td">
                      {m.schedule ? (
                        <Badge tone={m.schedule === 'OTC' ? 'green' : 'amber'}>
                          {m.schedule}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="td">{m.hsn_code || '-'}</td>
                    <td className="td text-center">{m.gst_rate}%</td>
                    <td className="td text-center">{m.rack || '-'}</td>
                    <td className="td text-center">
                      {stock <= m.reorder_level ? (
                        <Badge tone="amber">{stock}</Badge>
                      ) : (
                        <Badge tone="green">{stock}</Badge>
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn-secondary px-2 py-1"
                          onClick={() => setViewing(m)}
                        >
                          View
                        </button>
                        <button
                          className="btn-secondary px-2 py-1"
                          onClick={() => setBatchMed(m)}
                        >
                          Batches
                        </button>
                        <button
                          className="btn-secondary px-2 py-1"
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger px-2 py-1"
                          onClick={() => remove(m)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={medModal}
        title={editing ? 'Edit Medicine' : 'Add Medicine'}
        onClose={() => setMedModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setMedModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Generic / Salt</label>
            <input
              className="input"
              value={form.generic_name ?? ''}
              onChange={(e) => setForm({ ...form, generic_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Manufacturer</label>
            <input
              className="input"
              value={form.manufacturer ?? ''}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            />
          </div>
          <div>
            <label className="label">HSN Code</label>
            <input
              className="input"
              value={form.hsn_code ?? ''}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">GST Rate (%)</label>
            <select
              className="input"
              value={form.gst_rate}
              onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Pack Size</label>
            <input
              className="input"
              placeholder='e.g. 15, 100ml, 1×5ml'
              value={form.pack_size ?? ''}
              onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Schedule</label>
            <select
              className="input"
              value={form.schedule ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  schedule: (e.target.value || null) as MedicineSchedule | null,
                })
              }
            >
              {SCHEDULE_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Storage Type</label>
            <select
              className="input"
              value={form.storage_type ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  storage_type: (e.target.value || null) as MedicineStorageType | null,
                })
              }
            >
              {STORAGE_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Rack / Shelf</label>
            <input
              className="input"
              value={form.rack ?? ''}
              onChange={(e) => setForm({ ...form, rack: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Reorder Level</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.reorder_level}
              onChange={(e) =>
                setForm({ ...form, reorder_level: Number(e.target.value) })
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!viewing}
        title={viewing ? viewing.name : ''}
        onClose={() => setViewing(null)}
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
                    const m = viewing;
                    setViewing(null);
                    openEdit(m);
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
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-800">{viewing.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generic / Salt</dt>
              <dd className="font-medium text-slate-800">{viewing.generic_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Manufacturer</dt>
              <dd className="font-medium text-slate-800">{viewing.manufacturer || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">HSN Code</dt>
              <dd className="font-medium text-slate-800">{viewing.hsn_code || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">GST Rate</dt>
              <dd className="font-medium text-slate-800">{viewing.gst_rate}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">Category</dt>
              <dd className="font-medium text-slate-800">{viewing.category || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Pack Size</dt>
              <dd className="font-medium text-slate-800">{viewing.pack_size || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Schedule</dt>
              <dd className="font-medium text-slate-800">{scheduleLabel(viewing.schedule)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Storage Type</dt>
              <dd className="font-medium text-slate-800">{storageLabel(viewing.storage_type)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Rack / Shelf</dt>
              <dd className="font-medium text-slate-800">{viewing.rack || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Reorder Level</dt>
              <dd className="font-medium text-slate-800">{viewing.reorder_level}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Stock on Hand</dt>
              <dd className="font-medium text-slate-800">
                {stockMap[viewing.id] ?? 0}
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      {batchMed && (
        <BatchManager
          medicine={batchMed}
          onClose={() => {
            setBatchMed(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const emptyBatch = (medId: number): BatchInput => ({
  medicine_id: medId,
  batch_no: '',
  expiry_date: '',
  mrp: 0,
  purchase_price: 0,
  sale_price: 0,
  quantity_in_stock: 0,
});

function BatchManager({
  medicine,
  onClose,
}: {
  medicine: Medicine;
  onClose: () => void;
}) {
  const toast = useToast();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [form, setForm] = useState<BatchInput>(emptyBatch(medicine.id));
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(() => {
    window.pharmacy.batches.listByMedicine(medicine.id).then(setBatches);
  }, [medicine.id]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setForm(emptyBatch(medicine.id));
    setEditingId(null);
  };

  const save = async () => {
    if (!form.batch_no.trim() || !form.expiry_date) {
      toast.error('Batch number and expiry date are required.');
      return;
    }
    try {
      if (editingId) {
        await window.pharmacy.batches.update(editingId, form);
        toast.success('Batch updated.');
      } else {
        await window.pharmacy.batches.create(form);
        toast.success('Batch added.');
      }
      reset();
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const edit = (b: Batch) => {
    setEditingId(b.id);
    setForm({
      medicine_id: b.medicine_id,
      batch_no: b.batch_no,
      expiry_date: b.expiry_date,
      mrp: b.mrp,
      purchase_price: b.purchase_price,
      sale_price: b.sale_price,
      quantity_in_stock: b.quantity_in_stock,
    });
  };

  const remove = async (b: Batch) => {
    if (!confirm(`Delete batch ${b.batch_no}?`)) return;
    await window.pharmacy.batches.remove(b.id);
    load();
    if (editingId === b.id) reset();
  };

  return (
    <Modal open title={`Batches — ${medicine.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3">
          <div>
            <label className="label">Batch No *</label>
            <input
              className="input"
              value={form.batch_no}
              onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Expiry *</label>
            <input
              className="input"
              type="date"
              value={form.expiry_date}
              min={todayIso()}
              onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.quantity_in_stock}
              onChange={(e) =>
                setForm({ ...form, quantity_in_stock: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="label">MRP</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Purchase Price</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) =>
                setForm({ ...form, purchase_price: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="label">Sale Price</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-3 flex justify-end gap-2">
            {editingId && (
              <button className="btn-secondary" onClick={reset}>
                Cancel Edit
              </button>
            )}
            <button className="btn-primary" onClick={save}>
              {editingId ? 'Update Batch' : 'Add Batch'}
            </button>
          </div>
        </div>

        {!batches ? (
          <Spinner />
        ) : batches.length === 0 ? (
          <EmptyState message="No batches yet." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Batch</th>
                <th className="th">Expiry</th>
                <th className="th text-right">MRP</th>
                <th className="th text-right">Sale</th>
                <th className="th text-center">Qty</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const d = daysUntil(b.expiry_date);
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="td font-medium">{b.batch_no}</td>
                    <td className="td">
                      {formatDate(b.expiry_date)}{' '}
                      {d < 0 ? (
                        <Badge tone="red">Expired</Badge>
                      ) : d <= 90 ? (
                        <Badge tone="amber">{d}d</Badge>
                      ) : null}
                    </td>
                    <td className="td text-right">{inr(b.mrp)}</td>
                    <td className="td text-right">{inr(b.sale_price)}</td>
                    <td className="td text-center">{b.quantity_in_stock}</td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn-secondary px-2 py-1"
                          onClick={() => edit(b)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger px-2 py-1"
                          onClick={() => remove(b)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
