import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10 text-slate-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-slate-400">{message}</div>
  );
}

type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Committed when the field is left blank (default 0). */
  emptyValue?: number;
};

/** Number field that can be cleared (empty) while typing; commits on blur. */
export function NumberInput({
  value,
  onValueChange,
  emptyValue = 0,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="number"
      value={focused ? text : value}
      onFocus={(e) => {
        setFocused(true);
        setText(String(value));
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
        const n = Number(raw);
        if (!Number.isNaN(n)) onValueChange(n);
      }}
      onBlur={(e) => {
        setFocused(false);
        const n = Number(text);
        const next = text === '' || text === '-' || Number.isNaN(n) ? emptyValue : n;
        onValueChange(next);
        setText(String(next));
        onBlur?.(e);
      }}
    />
  );
}

export function Badge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue';
}) {
  const tones: Record<string, string> = {
    gray: 'bg-slate-100 text-slate-600',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ---- Toast system ----
interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface ToastCtx {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: 'success' | 'error') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const value: ToastCtx = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
              t.tone === 'success' ? 'bg-brand-600' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Extracts a readable message from an IPC error.
export function errMsg(e: unknown): string {
  if (e instanceof Error) {
    // Electron wraps thrown errors as "Error: <original>" possibly with channel prefix.
    return e.message.replace(/^Error: /, '').replace(/^.*Error invoking remote method '[^']+':\s*/, '');
  }
  return String(e);
}
