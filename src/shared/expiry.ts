/**
 * Batch expiry is month+year only (pharmacy convention: valid through end of month).
 * Stored as yyyy-mm-dd = last day of that month so SQLite date comparisons keep working.
 */

/** Accepts yyyy-mm, yyyy-mm-dd, or mm-yyyy → last day of month as yyyy-mm-dd. */
export function normalizeExpiryDate(value: string): string {
  const trimmed = value.trim();
  let year: number;
  let month: number;

  const ym = /^(\d{4})-(\d{2})$/.exec(trimmed);
  const ymd = /^(\d{4})-(\d{2})-\d{2}$/.exec(trimmed);
  const my = /^(\d{2})-(\d{4})$/.exec(trimmed);

  if (ym) {
    year = Number(ym[1]);
    month = Number(ym[2]);
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
  } else if (my) {
    month = Number(my[1]);
    year = Number(my[2]);
  } else {
    throw new Error('Expiry must be month and year (MM-YYYY).');
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Invalid expiry month.');
  }

  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Display as MM-YYYY. */
export function formatExpiry(value: string | null | undefined): string {
  if (!value) return '-';
  const m = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!m) return value;
  return `${m[2]}-${m[1]}`;
}

/** Value for &lt;input type="month"&gt; (yyyy-mm). */
export function expiryMonthInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}` : '';
}

/** Current month as yyyy-mm (local), for month-input min. */
export function currentExpiryMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
