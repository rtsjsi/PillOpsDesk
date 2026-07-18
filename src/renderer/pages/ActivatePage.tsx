import React, { useState } from 'react';
import type { LicenseStatus } from '../../shared/types';
import { useToast, errMsg } from '../components/ui';
import { formatDate } from '../lib/format';

interface Props {
  status: LicenseStatus;
  onActivated: (status: LicenseStatus) => void;
  title?: string;
}

export function ActivatePage({ status, onActivated, title = 'Activate Pharmacy Store' }: Props) {
  const toast = useToast();
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(status.machineId);
      setCopied(true);
      toast.success('Machine ID copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy Machine ID.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      toast.error('Paste your license key.');
      return;
    }
    setBusy(true);
    try {
      const next = await window.pharmacy.license.activate(licenseKey.trim());
      toast.success('License activated.');
      onActivated(next);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="card w-full max-w-xl p-8">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🔐</div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{status.message}</p>
        </div>

        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Machine ID
          </div>
          <div className="flex items-start gap-3">
            <code className="flex-1 break-all text-sm text-slate-800">{status.machineId}</code>
            <button type="button" className="btn-secondary shrink-0 px-3 py-1" onClick={copyMachineId}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Send this Machine ID to support when purchasing or renewing your annual license.
          </p>
        </div>

        {(status.pharmacyName || status.expires) && (
          <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
            {status.pharmacyName && (
              <div>
                <div className="text-xs uppercase text-slate-500">Pharmacy</div>
                <div className="font-medium text-slate-800">{status.pharmacyName}</div>
              </div>
            )}
            {status.expires && (
              <div>
                <div className="text-xs uppercase text-slate-500">Paid Through</div>
                <div className="font-medium text-slate-800">{formatDate(status.expires)}</div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">License Key</label>
            <textarea
              className="input min-h-[120px] font-mono text-xs"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="Paste the license key you received after payment"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Activating…' : 'Activate License'}
          </button>
        </form>
      </div>
    </div>
  );
}
