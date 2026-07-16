import React, { useCallback, useEffect, useState } from 'react';
import type { Customer, CustomerInput } from '../../shared/types';
import { Modal } from '../components/Modal';
import { Spinner, EmptyState, useToast, errMsg } from '../components/ui';

const empty: CustomerInput = { name: '', phone: '', address: '' };

export function Customers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Customer[] | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(empty);

  const load = useCallback(() => {
    window.pharmacy.customers.list(search).then(setList);
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
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? '', address: c.address ?? '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required.');
    try {
      if (editing) await window.pharmacy.customers.update(editing.id, form);
      else await window.pharmacy.customers.create(form);
      toast.success('Saved.');
      setModal(false);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (c: Customer) => {
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    await window.pharmacy.customers.remove(c.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
        <button className="btn-primary" onClick={openNew}>
          + Add Customer
        </button>
      </div>

      <input
        className="input max-w-md"
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-hidden">
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState message="No customers yet." />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th">Address</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.phone || '-'}</td>
                  <td className="td">{c.address || '-'}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary px-2 py-1" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button className="btn-danger px-2 py-1" onClick={() => remove(c)}>
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
        title={editing ? 'Edit Customer' : 'Add Customer'}
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
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
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
    </div>
  );
}
