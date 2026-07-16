import React, { useCallback, useEffect, useState } from 'react';
import type { Settings, User } from '../../shared/types';
import { Modal } from '../components/Modal';
import { Spinner, useToast, errMsg, Badge } from '../components/ui';
import { useAuth } from '../App';

export function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.pharmacy.settings.get().then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await window.pharmacy.settings.save(settings);
      setSettings(updated);
      toast.success('Settings saved.');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const backup = async () => {
    try {
      const path = await window.pharmacy.backup.backup();
      if (path) toast.success('Backup saved.');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const restore = async () => {
    try {
      await window.pharmacy.backup.restore();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (!settings) return <Spinner />;

  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>

      <div className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-700">Store Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Store Name</label>
            <input
              className="input"
              value={settings.store_name}
              onChange={(e) => set({ store_name: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              value={settings.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={settings.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input
              className="input"
              value={settings.gstin}
              onChange={(e) => set({ gstin: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Drug Licence No</label>
            <input
              className="input"
              value={settings.dl_no}
              onChange={(e) => set({ dl_no: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Invoice Prefix</label>
            <input
              className="input"
              value={settings.invoice_prefix}
              onChange={(e) => set({ invoice_prefix: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Expiry Alert (days)</label>
            <input
              className="input"
              type="number"
              value={settings.expiry_alert_days}
              onChange={(e) => set({ expiry_alert_days: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            Save Settings
          </button>
        </div>
      </div>

      <UsersSection currentUserId={user?.id ?? 0} />

      <div className="card p-5">
        <h2 className="mb-2 text-lg font-semibold text-slate-700">Backup &amp; Restore</h2>
        <p className="mb-4 text-sm text-slate-500">
          Back up your entire database to a file, or restore from a previous backup.
          Restoring replaces all current data and restarts the app.
        </p>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={backup}>
            Backup Now
          </button>
          <button className="btn-secondary" onClick={restore}>
            Restore from Backup
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersSection({ currentUserId }: { currentUserId: number }) {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [modal, setModal] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');

  const load = useCallback(() => {
    window.pharmacy.auth.listUsers().then(setUsers);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!username.trim() || !pin.trim()) return toast.error('Username and PIN required.');
    try {
      await window.pharmacy.auth.register(username.trim(), pin, role);
      toast.success('User added.');
      setModal(false);
      setUsername('');
      setPin('');
      setRole('staff');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (u: User) => {
    if (u.id === currentUserId) return toast.error('You cannot delete your own account.');
    if (!confirm(`Delete user "${u.username}"?`)) return;
    await window.pharmacy.auth.deleteUser(u.id);
    load();
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">Users</h2>
        <button className="btn-primary" onClick={() => setModal(true)}>
          + Add User
        </button>
      </div>
      {!users ? (
        <Spinner />
      ) : (
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Username</th>
              <th className="th">Role</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="td font-medium">{u.username}</td>
                <td className="td">
                  <Badge tone={u.role === 'owner' ? 'blue' : 'gray'}>{u.role}</Badge>
                </td>
                <td className="td text-right">
                  <button
                    className="btn-danger px-2 py-1"
                    onClick={() => remove(u)}
                    disabled={u.id === currentUserId}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modal}
        title="Add User"
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={add}>
              Add
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">PIN / Password</label>
            <input
              className="input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
