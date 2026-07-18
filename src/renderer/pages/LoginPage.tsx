import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { AppIcon } from '../components/AppIcon';
import { useToast, errMsg } from '../components/ui';

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [checking, setChecking] = useState(true);
  const [firstRun, setFirstRun] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.pharmacy.auth.hasUsers().then((has) => {
      setFirstRun(!has);
      if (!has) setUsername('owner');
      setChecking(false);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !pin.trim()) {
      toast.error('Enter username and PIN.');
      return;
    }
    setBusy(true);
    try {
      if (firstRun) {
        const user = await window.pharmacy.auth.register(username.trim(), pin, 'owner');
        setUser(user);
        toast.success('Owner account created.');
        navigate('/');
      } else {
        const user = await window.pharmacy.auth.login(username.trim(), pin);
        if (!user) {
          toast.error('Invalid username or PIN.');
          return;
        }
        setUser(user);
        navigate('/');
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (checking) return null;

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <AppIcon className="mx-auto mb-3 h-16 w-16 shadow-sm" />
          <h1 className="text-2xl font-bold text-slate-800">PillOpsDesk</h1>
          <p className="text-sm text-slate-500">
            {firstRun
              ? 'Create the owner account to get started'
              : 'Sign in to continue'}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">PIN / Password</label>
            <input
              className="input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {firstRun ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
