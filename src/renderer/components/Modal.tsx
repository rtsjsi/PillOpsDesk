import React from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** Near full-width dialog for dense purchase / sale entry forms */
  xl?: boolean;
  /**
   * When false, the body itself does not scroll — children manage their own
   * scroll regions (e.g. only the line-items table).
   */
  bodyScroll?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  xl,
  bodyScroll = true,
}: ModalProps) {
  if (!open) return null;
  const width = xl ? 'max-w-7xl' : wide ? 'max-w-3xl' : 'max-w-lg';
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3"
      onMouseDown={onClose}
    >
      <div
        className={`card flex w-full ${width} ${
          bodyScroll ? 'max-h-[94vh]' : 'h-[94vh]'
        } flex-col overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div
          className={
            bodyScroll
              ? 'min-h-0 flex-1 overflow-y-auto px-5 py-4'
              : 'flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4'
          }
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
