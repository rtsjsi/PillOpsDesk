import React from 'react';
import { useWriteAllowed } from '../App';

export function ReadOnlyNotice() {
  const canWrite = useWriteAllowed();
  if (canWrite) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <strong>Read-only mode.</strong> New sales, purchases, and stock changes are disabled until
      the owner renews the subscription under Settings.
    </div>
  );
}
