/** Window / tab title: brand first, then store name when set. */
export function applyAppTitle(storeName?: string | null): void {
  const name = (storeName ?? '').trim();
  document.title = name ? `PillOpsDesk — ${name}` : 'PillOpsDesk';
}
