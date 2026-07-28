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
        ${settings.address ? `<div class="muted">${esc(settings.address)}</div>` : ''}
        ${settings.phone ? `<div class="muted">Ph: ${esc(settings.phone)}</div>` : ''}
        ${settings.gstin ? `<div class="muted">GSTIN: ${esc(settings.gstin)}</div>` : ''}
        ${settings.pan ? `<div class="muted">PAN: ${esc(settings.pan)}</div>` : ''}
        ${settings.dl_no ? `<div class="muted">D.L. No: ${esc(settings.dl_no)}</div>` : ''}
      `;
  const toBlock = sale.customer_name
    ? `
        <div class="party-title">To</div>
        <div><strong>${esc(sale.customer_name)}</strong></div>
        ${sale.customer_address ? `<div class="muted">${esc(sale.customer_address)}</div>` : ''}
        ${sale.customer_phone ? `<div class="muted">Ph: ${esc(sale.customer_phone)}</div>` : ''}
        ${sale.customer_gstin ? `<div class="muted">GSTIN: ${esc(sale.customer_gstin)}</div>` : ''}
        ${sale.customer_pan ? `<div class="muted">PAN: ${esc(sale.customer_pan)}</div>` : ''}
        ${sale.customer_dl_no ? `<div class="muted">D.L. No: ${esc(sale.customer_dl_no)}</div>` : ''}
      `
    : `
        <div class="party-title">To</div>
        <div><strong>Walk-in Customer</strong></div>
      `;

  const metaBlock = `
        <div class="meta-title">TAX INVOICE</div>
        <div class="meta-line"><span class="meta-label">Invoice No</span><br><strong>${esc(sale.invoice_no)}</strong></div>
        <div class="meta-line"><span class="meta-label">Date</span><br>${esc(dateStr)}</div>
      `;

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${esc(sale.invoice_no)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; padding: 12px; font-size: 9px; }
    .muted { color: #555; }
    .header {
      display: flex;
      gap: 10px;
      align-items: stretch;
      border-bottom: 2px solid #222;
      padding-bottom: 8px;
      margin-bottom: 0;
    }
    .party-box {
      flex: 1 1 0;
      border: 1px solid #ccc;
      padding: 6px 8px;
      min-height: 78px;
      min-width: 0;
    }
    .meta-box {
      flex: 0 0 28%;
      border: 1px solid #ccc;
      padding: 8px 10px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      min-height: 78px;
    }
    .party-title {
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .meta-title {
      font-weight: bold;
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .meta-label {
      color: #555;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .meta-line { font-size: 10px; line-height: 1.35; }
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
    <div class="header">
      <div class="party-box">${fromBlock}</div>
      <div class="meta-box">${metaBlock}</div>
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
