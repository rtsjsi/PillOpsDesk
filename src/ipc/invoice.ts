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
  return n.toFixed(2);
}

function buildInvoiceHtml(sale: SaleWithItems, settings: Settings): string {
  const rows = sale.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.medicine_name)}<br><small>Batch: ${esc(it.batch_no)}</small></td>
        <td>${esc(it.hsn_code)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${money(it.price)}</td>
        <td class="num">${it.gst_rate}%</td>
        <td class="num">${money(it.discount)}</td>
        <td class="num">${money(it.line_total)}</td>
      </tr>`
    )
    .join('');

  const dateStr = new Date(sale.sale_date).toLocaleString('en-IN');

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${esc(sale.invoice_no)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; font-size: 13px; }
    h1 { margin: 0; font-size: 20px; }
    .muted { color: #555; }
    .head { display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 12px; }
    .meta { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; }
    .num { text-align: right; }
    tfoot td { font-weight: bold; }
    .totals { margin-top: 12px; width: 320px; margin-left: auto; }
    .totals td { border: none; padding: 3px 8px; }
    .grand { font-size: 16px; border-top: 2px solid #222 !important; }
    .footer { margin-top: 40px; text-align: center; color: #666; font-size: 11px; }
  </style></head>
  <body>
    <div class="head">
      <div>
        <h1>${esc(settings.store_name)}</h1>
        <div class="muted">${esc(settings.address)}</div>
        <div class="muted">${settings.phone ? 'Ph: ' + esc(settings.phone) : ''}</div>
        <div class="muted">${settings.gstin ? 'GSTIN: ' + esc(settings.gstin) : ''}</div>
        <div class="muted">${settings.dl_no ? 'D.L. No: ' + esc(settings.dl_no) : ''}</div>
      </div>
      <div class="meta">
        <h2 style="margin:0">TAX INVOICE</h2>
        <div><strong>${esc(sale.invoice_no)}</strong></div>
        <div class="muted">${dateStr}</div>
        <div class="muted">${sale.customer_name ? 'Customer: ' + esc(sale.customer_name) : 'Walk-in Customer'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th><th>Item</th><th>HSN</th><th class="num">Qty</th>
          <th class="num">Rate</th><th class="num">GST</th>
          <th class="num">Disc</th><th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Taxable Value</td><td class="num">${money(sale.subtotal)}</td></tr>
      <tr><td>CGST</td><td class="num">${money(sale.cgst)}</td></tr>
      <tr><td>SGST</td><td class="num">${money(sale.sgst)}</td></tr>
      <tr><td>Discount</td><td class="num">- ${money(sale.discount)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="num">Rs. ${money(sale.total)}</td></tr>
    </table>

    <div class="footer">
      This is a computer-generated invoice. Get well soon!
    </div>
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
    win.webContents.print({ silent: false, printBackground: true }, (success) => {
      win.close();
      resolve(success);
    });
  });
}
