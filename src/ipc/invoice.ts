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
  if (s == null || s === '') return '—';
  return String(s);
}

function detailLine(label: string, value: string | null | undefined): string {
  if (!value?.trim()) return '';
  return `<div class="detail"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}

/** Indian-style amount in words for invoice totals (rupees + paise). */
function amountInWords(amount: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ''}`.trim();
  };

  const threeDigits = (n: number): string => {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h && r) return `${ones[h]} Hundred ${twoDigits(r)}`;
    if (h) return `${ones[h]} Hundred`;
    return twoDigits(r);
  };

  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const crore = Math.floor(rupees / 1_00_00_000);
  const lakh = Math.floor((rupees % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((rupees % 1_00_000) / 1000);
  const hundred = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  let words = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!words) words = 'Zero';
  words = `${words} Rupee${rupees === 1 ? '' : 's'}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

function buildInvoiceHtml(sale: SaleWithItems, settings: Settings): string {
  const rows = sale.items
    .map((it, i) => {
      const exp = formatExpiry(it.expiry_date);
      return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="item">${esc(it.medicine_name)}</td>
        <td>${esc(dash(it.manufacturer))}</td>
        <td class="c">${esc(dash(it.pack_size))}</td>
        <td class="c">${esc(dash(it.hsn_code))}</td>
        <td class="c">${esc(it.batch_no)}</td>
        <td class="c">${esc(exp)}</td>
        <td class="num">${money(it.mrp)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${it.free_quantity || '—'}</td>
        <td class="num">${money(it.price)}</td>
        <td class="num">${it.discount_percent > 0 ? `${it.discount_percent}%` : '—'}</td>
        <td class="num">${money(it.taxable_value)}</td>
        <td class="num">${it.gst_rate}%</td>
        <td class="num amount">${money(it.line_total)}</td>
      </tr>`;
    })
    .join('');

  const saleDate = new Date(sale.sale_date);
  const invoiceDate = [
    String(saleDate.getDate()).padStart(2, '0'),
    String(saleDate.getMonth() + 1).padStart(2, '0'),
    String(saleDate.getFullYear()),
  ].join('-');

  const fromBlock = `
      <div class="panel-label">From</div>
      <div class="party-name">${esc(settings.store_name || 'Seller')}</div>
      ${settings.address ? `<div class="party-address">${esc(settings.address)}</div>` : ''}
      <div class="details">
        ${detailLine('Phone', settings.phone)}
        ${detailLine('GSTIN', settings.gstin)}
        ${detailLine('PAN', settings.pan)}
        ${detailLine('D.L. No', settings.dl_no)}
      </div>
    `;

  const toBlock = sale.customer_name
    ? `
      <div class="panel-label">To</div>
      <div class="party-name">${esc(sale.customer_name)}</div>
      ${sale.customer_address ? `<div class="party-address">${esc(sale.customer_address)}</div>` : ''}
      <div class="details">
        ${detailLine('Phone', sale.customer_phone)}
        ${detailLine('GSTIN', sale.customer_gstin)}
        ${detailLine('PAN', sale.customer_pan)}
        ${detailLine('D.L. No', sale.customer_dl_no)}
      </div>
    `
    : `
      <div class="panel-label">To</div>
      <div class="party-name">Walk-in Customer</div>
    `;

  const words = amountInWords(sale.total);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(sale.invoice_no)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      color: #1c2430;
      background: #fff;
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      font-size: 9px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet {
      border: 1px solid #c9d1dc;
      border-radius: 2px;
      overflow: hidden;
    }

    .header {
      display: grid;
      grid-template-columns: 1fr 0.92fr 1fr;
      align-items: stretch;
      border-bottom: 2px solid #1c2430;
    }

    .panel {
      padding: 10px 12px;
      min-height: 108px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .panel + .panel { border-left: 1px solid #c9d1dc; }

    .panel-label {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #5b6777;
      margin-bottom: 2px;
    }

    .party-name {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      line-height: 1.25;
    }

    .party-address {
      color: #4b5565;
      margin-bottom: 2px;
    }

    .details { margin-top: 2px; }
    .detail {
      display: grid;
      grid-template-columns: 52px 1fr;
      gap: 4px;
      padding: 1px 0;
    }
    .detail .k {
      color: #6b7280;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .detail .v {
      color: #1c2430;
      font-weight: 600;
      word-break: break-word;
    }

    .meta {
      text-align: center;
      justify-content: center;
      align-items: center;
      background: #f4f7fa;
      gap: 8px;
    }
    .meta-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0f3d4c;
      margin-bottom: 4px;
    }
    .meta-line {
      font-size: 10.5px;
      font-weight: 600;
      color: #111827;
      line-height: 1.45;
      white-space: nowrap;
    }

    .body { padding: 10px 10px 12px; }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.items th,
    table.items td {
      border: 1px solid #d5dde8;
      padding: 4px 3px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    table.items thead th {
      background: #eef3f7;
      color: #334155;
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: center;
      white-space: nowrap;
    }
    table.items tbody tr:nth-child(even) td { background: #fafbfd; }
    table.items td.item { font-weight: 600; color: #111827; }
    table.items .c { text-align: center; }
    table.items .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    table.items .amount { font-weight: 700; }

    col.c-no { width: 3%; }
    col.c-item { width: 16%; }
    col.c-mfg { width: 11%; }
    col.c-pack { width: 5%; }
    col.c-hsn { width: 6%; }
    col.c-batch { width: 7%; }
    col.c-exp { width: 6%; }
    col.c-mrp { width: 6%; }
    col.c-qty { width: 4%; }
    col.c-free { width: 4%; }
    col.c-rate { width: 6%; }
    col.c-disc { width: 5%; }
    col.c-tax { width: 7%; }
    col.c-gst { width: 5%; }
    col.c-amt { width: 9%; }

    .bottom {
      display: grid;
      grid-template-columns: 1.35fr 0.9fr;
      gap: 12px;
      margin-top: 12px;
      align-items: start;
    }

    .words-box {
      border: 1px solid #d5dde8;
      border-radius: 2px;
      padding: 10px 12px;
      background: #fafbfd;
    }
    .words-label {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .words-value {
      font-size: 10px;
      font-weight: 600;
      color: #1c2430;
      line-height: 1.4;
    }

    .totals {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #c9d1dc;
    }
    .totals td {
      padding: 5px 10px;
      font-size: 10px;
      border-bottom: 1px solid #e5eaf1;
    }
    .totals td:last-child {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      white-space: nowrap;
    }
    .totals tr:last-child td { border-bottom: none; }
    .totals .grand td {
      background: #0f3d4c;
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      padding: 8px 10px;
    }

    @media print {
      body { padding: 0; }
      .sheet { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="panel">${fromBlock}</div>
      <div class="panel meta">
        <div class="meta-title">Tax Invoice</div>
        <div class="meta-line">Invoice No: ${esc(sale.invoice_no)}</div>
        <div class="meta-line">Invoice Date: ${esc(invoiceDate)}</div>
      </div>
      <div class="panel">${toBlock}</div>
    </div>

    <div class="body">
      <table class="items">
        <colgroup>
          <col class="c-no" /><col class="c-item" /><col class="c-mfg" /><col class="c-pack" />
          <col class="c-hsn" /><col class="c-batch" /><col class="c-exp" /><col class="c-mrp" />
          <col class="c-qty" /><col class="c-free" /><col class="c-rate" /><col class="c-disc" />
          <col class="c-tax" /><col class="c-gst" /><col class="c-amt" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Mfg</th>
            <th>Pack</th>
            <th>HSN</th>
            <th>Batch</th>
            <th>Exp</th>
            <th>MRP</th>
            <th>Qty</th>
            <th>Free</th>
            <th>Rate</th>
            <th>Disc%</th>
            <th>Taxable</th>
            <th>GST%</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="bottom">
        <div class="words-box">
          <div class="words-label">Amount in words</div>
          <div class="words-value">${esc(words)}</div>
        </div>
        <table class="totals">
          <tr><td>Discount</td><td>− ${money(sale.discount)}</td></tr>
          <tr><td>Taxable Value</td><td>${money(sale.subtotal)}</td></tr>
          <tr><td>CGST</td><td>${money(sale.cgst)}</td></tr>
          <tr><td>SGST</td><td>${money(sale.sgst)}</td></tr>
          <tr class="grand"><td>Grand Total</td><td>₹ ${money(sale.total)}</td></tr>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
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
