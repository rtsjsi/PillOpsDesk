import { formatExpiry } from '@shared/expiry';
import { BrowserWindow } from 'electron';
import { getSale } from '../db/services/sales';
import { getSettings } from '../db/services/settings';
import type { SaleWithItems, Settings } from '@shared/types';

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(n: number): string {
  return Number(n ?? 0).toFixed(2);
}

function dash(s: string | number | null | undefined): string {
  if (s == null || s === '') return '-';
  return String(s);
}

function buildInvoiceHtml(sale: SaleWithItems, settings: Settings): string {
  const rows = sale.items
    .map((it, i) => {
      const exp = formatExpiry(it.expiry_date);
      return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.medicine_name)}</td>
        <td>${esc(dash(it.manufacturer))}</td>
        <td>${esc(dash(it.pack_size))}</td>
        <td>${esc(dash(it.hsn_code))}</td>
        <td>${esc(it.batch_no)}</td>
        <td>${esc(exp)}</td>
        <td class="num">${money(it.mrp)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${it.free_quantity || '-'}</td>
        <td class="num">${money(it.price)}</td>
        <td class="num">${it.discount_percent > 0 ? it.discount_percent + '%' : '-'}</td>
        <td class="num">${money(it.taxable_value)}</td>
        <td class="num">${it.gst_rate}%</td>
        <td class="num">${money(it.line_total)}</td>
      </tr>`;
    })
    .join('');

  const dateStr = new Date(sale.sale_date).toLocaleString('en-IN');
  const fromBlock = `
        <div class="party-title">From</div>
        <div><strong>${esc(settings.store_name)}</strong></div>
        ${settings.address ? `<div class="muted">${esc(settings.address)}</div>` : ''}
        ${settings.phone ? `<div class="muted">Ph: ${esc(settings.phone)}</div>` : ''}
        ${settings.gstin ? `<div class="muted">GSTIN: ${esc(settings.gstin)}</div>` : ''}
        ${settings.dl_no ? `<div class="muted">D.L. No: ${esc(settings.dl_no)}</div>` : ''}
      `;
  const toBlock = sale.customer_name
    ? `
        <div class="party-title">To</div>
        <div><strong>${esc(sale.customer_name)}</strong></div>
        ${sale.customer_address ? `<div class="muted">${esc(sale.customer_address)}</div>` : ''}
        ${sale.customer_phone ? `<div class="muted">Ph: ${esc(sale.customer_phone)}</div>` : ''}
        ${sale.customer_gstin ? `<div class="muted">GSTIN: ${esc(sale.customer_gstin)}</div>` : ''}
      `
    : `
        <div class="party-title">To</div>
        <div><strong>Walk-in Customer</strong></div>
      `;

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${esc(sale.invoice_no)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; padding: 12px; font-size: 9px; }
    h1 { margin: 0; font-size: 16px; }
    h2 { margin: 0; font-size: 13px; }
    .muted { color: #555; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #222; padding-bottom: 8px; }
    .title-row .meta { text-align: right; }
    .party { margin-top: 10px; display: flex; gap: 12px; align-items: stretch; }
    .party-box { flex: 1; border: 1px solid #ccc; padding: 6px 8px; min-height: 72px; }
    .party-title { font-weight: bold; font-size: 10px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
    table.items th, table.items td { border: 1px solid #ccc; padding: 2px 3px; text-align: left; vertical-align: top; word-wrap: break-word; }
    table.items th { background: #f0f0f0; font-size: 8px; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 10px; width: 280px; margin-left: auto; border-collapse: collapse; }
    .totals td { border: none; padding: 2px 6px; font-size: 11px; }
    .grand { font-size: 13px; font-weight: bold; border-top: 2px solid #222 !important; }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      body { padding: 0; }
    }
  </style></head>
  <body>
    <div class="title-row">
      <div>
        <h1>${esc(settings.store_name)}</h1>
      </div>
      <div class="meta">
        <h2>TAX INVOICE</h2>
        <div><strong>${esc(sale.invoice_no)}</strong></div>
        <div class="muted">${dateStr}</div>
      </div>
    </div>

    <div class="party">
      <div class="party-box">${fromBlock}</div>
      <div class="party-box">${toBlock}</div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>Mfg</th>
          <th>Pack</th>
          <th>HSN</th>
          <th>Batch</th>
          <th>Exp</th>
          <th class="num">MRP</th>
          <th class="num">Qty</th>
          <th class="num">Free</th>
          <th class="num">Rate</th>
          <th class="num">Disc %</th>
          <th class="num">Taxable</th>
          <th class="num">GST %</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Discount</td><td class="num">- ${money(sale.discount)}</td></tr>
      <tr><td>Taxable Value</td><td class="num">${money(sale.subtotal)}</td></tr>
      <tr><td>CGST</td><td class="num">${money(sale.cgst)}</td></tr>
      <tr><td>SGST</td><td class="num">${money(sale.sgst)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="num">Rs. ${money(sale.total)}</td></tr>
    </table>
  </body></html>`;
}

export async function printInvoice(saleId: number): Promise<boolean> {
  const sale = getSale(saleId);
  if (!sale) throw new Error('Invoice not found.');
  const settings = getSettings();
  const html = buildInvoiceHtml(sale, settings);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  return new Promise<boolean>((resolve) => {
    win.webContents.print(
      {
        silent: false,
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
      },
      (success) => {
        win.close();
        resolve(success);
      }
    );
  });
}
