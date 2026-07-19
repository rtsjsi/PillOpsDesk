import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useLicense } from '../App';
import type { Settings } from '../../shared/types';
import { AppIcon } from './AppIcon';

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
    window.pharmacy.settings.get().then(setSettings);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col bg-brand-800 text-brand-50">
        <div className="border-b border-brand-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <AppIcon className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-tight">
                {settings?.store_name || 'PillOpsDesk'}
              </div>
              <div className="text-xs text-brand-200">Offline Management</div>
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
      <main className="flex-1 overflow-y-auto">
        {licenseStatus?.state === 'grace' && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
            <strong>Subscription expired.</strong> {licenseStatus.message}
          </div>
        )}
        {licenseStatus?.state === 'readonly' && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-900">
            <strong>Read-only mode.</strong> {licenseStatus.message}
            {user?.role === 'owner' && (
              <span> Renew under Settings → Subscription.</span>
            )}
          </div>
        )}
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
