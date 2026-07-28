import React, { useCallback, useEffect, useState } from 'react';
import type { Supplier, SupplierInput } from '../../shared/types';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';
import { ReadOnlyNotice } from '../components/ReadOnlyNotice';
import { useWriteAllowed } from '../App';

const empty: SupplierInput = {
  name: '',
  phone: '',
  address: '',
  gstin: '',
  pan: '',
  dl_no: '',
};

export function Suppliers() {
  const toast = useToast();
  const canWrite = useWriteAllowed();
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Supplier[] | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput>(empty);

  const load = useCallback(() => {
    window.pharmacy.suppliers.list(search).then(setList);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setModal(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone ?? '',
      address: s.address ?? '',
      gstin: s.gstin ?? '',
      pan: s.pan ?? '',
      dl_no: s.dl_no ?? '',
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required.');
    try {
      if (editing) await window.pharmacy.suppliers.update(editing.id, form);
      else await window.pharmacy.suppliers.create(form);
      toast.success('Saved.');
      setModal(false);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    await window.pharmacy.suppliers.remove(s.id);
    load();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-4">
        <ReadOnlyNotice />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Suppliers</h1>
          <button className="btn-primary" onClick={openNew} disabled={!canWrite}>
            + Add Supplier
          </button>
        </div>

        <input
          className="input max-w-md"
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card min-h-0 flex-1 overflow-auto">
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState message="No suppliers yet." />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th">GSTIN</th>
                <th className="th">PAN</th>
                <th className="th">D.L. No</th>
                <th className="th">Address</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td font-medium">{s.name}</td>
                  <td className="td">{s.phone || '-'}</td>
                  <td className="td">{s.gstin || '-'}</td>
                  <td className="td">{s.pan || '-'}</td>
                  <td className="td">{s.dl_no || '-'}</td>
                  <td className="td">{s.address || '-'}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn-secondary px-2 py-1"
                        onClick={() => setViewing(s)}
                      >
                        View
                      </button>
                      <button className="btn-secondary px-2 py-1" onClick={() => openEdit(s)}>
                        Edit
                      </button>
                      <button className="btn-danger px-2 py-1" onClick={() => remove(s)}>
                        Delete
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
        open={modal}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input
                className="input"
                value={form.gstin ?? ''}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
            </div>
            <div>
              <label className="label">PAN Card</label>
              <input
                className="input"
                value={form.pan ?? ''}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                maxLength={10}
                placeholder="ABCDE1234F"
              />
            </div>
            <div>
              <label className="label">D.L. No</label>
              <input
                className="input"
                value={form.dl_no ?? ''}
                onChange={(e) => setForm({ ...form, dl_no: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
                    const s = viewing;
                    setViewing(null);
                    openEdit(s);
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
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-800">{viewing.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-800">{viewing.phone || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">GSTIN</dt>
              <dd className="font-medium text-slate-800">{viewing.gstin || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">PAN Card</dt>
              <dd className="font-medium text-slate-800">{viewing.pan || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">D.L. No</dt>
              <dd className="font-medium text-slate-800">{viewing.dl_no || '-'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Address</dt>
              <dd className="font-medium text-slate-800">{viewing.address || '-'}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}
