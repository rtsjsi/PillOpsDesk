import React, { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { LicenseStatus, User } from '../shared/types';
import { ToastProvider, Spinner } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ActivatePage } from './pages/ActivatePage';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Purchases } from './pages/Purchases';
import { Customers } from './pages/Customers';
import { Suppliers } from './pages/Suppliers';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/SettingsPage';
import { Sales } from './pages/Sales';

const SESSION_USER_KEY = 'user';
const REMEMBERED_USER_KEY = 'rememberedUser';

interface AuthState {
  user: User | null;
  setUser: (u: User | null, options?: { remember?: boolean }) => void;
  logout: () => void;
}

function clearStoredUser(): void {
  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(REMEMBERED_USER_KEY);
}

function readStoredUser(): User | null {
  const raw =
    localStorage.getItem(REMEMBERED_USER_KEY) ??
    sessionStorage.getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    clearStoredUser();
    return null;
  }
}

interface LicenseState {
  status: LicenseStatus | null;
  refreshLicense: () => Promise<LicenseStatus>;
  canWrite: boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const LicenseContext = createContext<LicenseState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

export function useLicense(): LicenseState {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense outside provider');
  return ctx;
}

export function useWriteAllowed(): boolean {
  return useLicense().canWrite;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireOwner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'owner') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);

  const refreshLicense = async () => {
    const status = await window.pharmacy.license.getStatus();
    setLicenseStatus(status);
    return status;
  };

  useEffect(() => {
    async function boot() {
      const status = await window.pharmacy.license.getStatus();
      setLicenseStatus(status);

      if (
        status.state === 'active' ||
        status.state === 'grace' ||
        status.state === 'readonly'
      ) {
        const cached = readStoredUser();
        if (cached) {
          const live = await window.pharmacy.auth.getUser(cached.id);
          if (live) setUser(live);
          else clearStoredUser();
        }
      }

      setReady(true);
    }
    boot();
  }, []);

  const handleSetUser = (u: User | null, options?: { remember?: boolean }) => {
    setUser(u);
    if (!u) {
      clearStoredUser();
      return;
    }
    const payload = JSON.stringify(u);
    sessionStorage.setItem(SESSION_USER_KEY, payload);
    if (options?.remember) {
      localStorage.setItem(REMEMBERED_USER_KEY, payload);
    } else {
      localStorage.removeItem(REMEMBERED_USER_KEY);
    }
  };

  const logout = () => handleSetUser(null);

  if (!ready || !licenseStatus) return <Spinner />;

  if (licenseStatus.state === 'unlicensed' || licenseStatus.state === 'blocked') {
    return (
      <ToastProvider>
        <ActivatePage
          status={licenseStatus}
          onActivated={(status) => {
            setLicenseStatus(status);
          }}
        />
      </ToastProvider>
    );
  }

  const canWrite =
    licenseStatus.state === 'active' || licenseStatus.state === 'grace';

  return (
    <ToastProvider>
      <LicenseContext.Provider
        value={{ status: licenseStatus, refreshLicense, canWrite }}
      >
        <AuthContext.Provider value={{ user, setUser: handleSetUser, logout }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="sales" element={<Sales />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="customers" element={<Customers />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="reports" element={<Reports />} />
              <Route
                path="settings"
                element={
                  <RequireOwner>
                    <SettingsPage />
                  </RequireOwner>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthContext.Provider>
      </LicenseContext.Provider>
    </ToastProvider>
  );
}
