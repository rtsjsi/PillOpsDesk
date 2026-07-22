import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useLicense } from '../App';
import type { Settings } from '../../shared/types';
import { AppIcon } from './AppIcon';
import { applyAppTitle } from '../lib/appTitle';

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: '🏠' },
  { to: '/purchases', label: 'Purchases', icon: '📦' },
  { to: '/sales', label: 'Sales', icon: '🧾' },
  { to: '/inventory', label: 'Inventory', icon: '💊' },
  { to: '/suppliers', label: 'Suppliers', icon: '🚚' },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { status: licenseStatus } = useLicense();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);

  const navItems =
    user?.role === 'owner' ? NAV : NAV.filter((item) => item.to !== '/settings');

  useEffect(() => {
    window.pharmacy.settings.get().then((s) => {
      setSettings(s);
      applyAppTitle(s.store_name);
    });
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col bg-brand-800 text-brand-50">
        <div className="border-b border-brand-700 px-4 py-4">
          <div className="flex items-start gap-3">
            <AppIcon className="mt-0.5 h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="break-words text-base font-bold leading-snug">
                {settings?.store_name || 'PillOpsDesk'}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-brand-100 hover:bg-brand-700'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-brand-700 p-3">
          <div className="mb-2 px-2 text-sm">
            <div className="font-medium text-white">{user?.username}</div>
            <div className="text-xs capitalize text-brand-200">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {licenseStatus?.state === 'grace' && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
            <strong>Subscription expired.</strong> {licenseStatus.message}
          </div>
        )}
        {licenseStatus?.state === 'readonly' && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-900">
            <strong>Read-only mode.</strong> {licenseStatus.message}
            {user?.role === 'owner' && (
              <span> Renew under Settings → Subscription.</span>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex h-full max-w-7xl flex-col">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
