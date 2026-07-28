import { formatExpiry } from '@shared/expiry';
import { round2, saleRoundOff } from '@shared/gst';
import { BrowserWindow } from 'electron';
import { getSale } from '../db/services/sales';
import { getSettings } from '../db/services/settings';
import type { SaleItem, SaleWithItems, Settings } from '@shared/types';

/** Item rows that fit in the upper half of A4 with the footer block. */
const ROWS_WITH_FOOTER = 11;
/** Item rows that fit on a continuation page (header + lines only). */
const ROWS_CONTINUATION = 18;

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

function detailBits(
  ...pairs: Array<[string, string | null | undefined]>
): string {
  return pairs
    .filter(([, v]) => !!v?.trim())
    .map(([k, v]) => `<span class="bit"><b>${esc(k)}:</b> ${esc(v)}</span>`)
    .join(' · ');
}

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

  let words = parts.join(' ').replace(/\s+/g, ' ').trim() || 'Zero';
  words = `${words} Rupee${rupees === 1 ? '' : 's'}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

function lineGstAmount(it: SaleItem): number {
  return round2((it.line_total ?? 0) - (it.taxable_value ?? 0));
}

function buildGstBreakup(items: SaleItem[]): {
  gst_rate: number;
  taxable: number;
  sgst: number;
  cgst: number;
  igst: number;
}[] {
  const map = new Map<number, { taxable: number; tax: number }>();
  for (const it of items) {
    const rate = Number(it.gst_rate) || 0;
    const cur = map.get(rate) ?? { taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + (it.taxable_value ?? 0));
    cur.tax = round2(cur.tax + lineGstAmount(it));
    map.set(rate, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gst_rate, v]) => ({
      gst_rate,
      taxable: v.taxable,
      sgst: round2(v.tax / 2),
      cgst: round2(v.tax / 2),
      igst: 0,
    }));
}

function chunkItems<T>(items: T[]): T[][] {
  if (items.length === 0) return [[]];
  if (items.length <= ROWS_WITH_FOOTER) return [items];

  const pages: T[][] = [];
  let remaining = [...items];

  // Leave last page for footer capacity.
  while (remaining.length > ROWS_WITH_FOOTER) {
    pages.push(remaining.slice(0, ROWS_CONTINUATION));
    remaining = remaining.slice(ROWS_CONTINUATION);
  }
  if (remaining.length) pages.push(remaining);
  // If last chunk is empty somehow, ensure at least one page.
  return pages.length ? pages : [[]];
}

function emptyItemCells(): string {
  return Array.from({ length: 16 }, () => '<td>&nbsp;</td>').join('');
}

function itemRowsHtml(items: SaleItem[], startIndex: number): string {
  return items
    .map((it, i) => {
      const gstAmt = lineGstAmount(it);
      return `<tr>
        <td class="c">${startIndex + i + 1}</td>
        <td class="item">${esc(it.medicine_name)}</td>
        <td>${esc(dash(it.manufacturer))}</td>
        <td class="c">${esc(dash(it.pack_size))}</td>
        <td class="c">${esc(dash(it.hsn_code))}</td>
        <td class="c">${esc(it.batch_no)}</td>
        <td class="c">${esc(formatExpiry(it.expiry_date))}</td>
        <td class="num">${money(it.mrp)}</td>
        <td class="num">${it.quantity}</td>
        <td class="num">${it.free_quantity || '—'}</td>
        <td class="num">${money(it.price)}</td>
        <td class="num">${it.discount_percent > 0 ? `${it.discount_percent}%` : '—'}</td>
        <td class="num">${money(it.taxable_value)}</td>
        <td class="num">${it.gst_rate}%</td>
        <td class="num">${money(gstAmt)}</td>
        <td class="num amt">${money(it.line_total)}</td>
      </tr>`;
    })
    .join('');
}

function buildInvoiceHtml(sale: SaleWithItems, settings: Settings): string {
  const saleDate = new Date(sale.sale_date);
  const invoiceDate = [
    String(saleDate.getDate()).padStart(2, '0'),
    String(saleDate.getMonth() + 1).padStart(2, '0'),
    String(saleDate.getFullYear()),
  ].join('-');

  const fromDetails = detailBits(
    ['Ph', settings.phone],
    ['GSTIN', settings.gstin],
    ['PAN', settings.pan],
    ['DL', settings.dl_no]
  );
  const toDetails = sale.customer_name
    ? detailBits(
        ['Ph', sale.customer_phone],
        ['GSTIN', sale.customer_gstin],
        ['PAN', sale.customer_pan],
        ['DL', sale.customer_dl_no]
      )
    : '';

  const roundOff = saleRoundOff(sale);
  const words = amountInWords(sale.total);
  const breakup = buildGstBreakup(sale.items);

  const sumQty = sale.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const sumFree = sale.items.reduce((s, it) => s + (it.free_quantity || 0), 0);
  const sumTaxable = round2(sale.items.reduce((s, it) => s + (it.taxable_value || 0), 0));
  const sumGst = round2(sale.items.reduce((s, it) => s + lineGstAmount(it), 0));
  const sumAmount = round2(sale.items.reduce((s, it) => s + (it.line_total || 0), 0));

  const pages = chunkItems(sale.items);
  const pageCount = pages.length;

  const breakupRows = breakup
    .map(
      (r) => `<tr>
        <td class="c">${money(r.gst_rate)}</td>
        <td class="num">${money(r.taxable)}</td>
        <td class="num">${money(r.sgst)}</td>
        <td class="num">${money(r.cgst)}</td>
        <td class="num">${money(r.igst)}</td>
      </tr>`
    )
    .join('');

  let indexOffset = 0;
  const pageHtml = pages
    .map((pageItems, pageIdx) => {
      const isLast = pageIdx === pageCount - 1;
      const rows = itemRowsHtml(pageItems, indexOffset);
      indexOffset += pageItems.length;

      const totalsRow = isLast
        ? `<tr class="sum">
            <td colspan="8" class="c"><b>Total</b></td>
            <td class="num"><b>${sumQty}</b></td>
            <td class="num"><b>${sumFree || '—'}</b></td>
            <td colspan="2"></td>
            <td class="num"><b>${money(sumTaxable)}</b></td>
            <td></td>
            <td class="num"><b>${money(sumGst)}</b></td>
            <td class="num amt"><b>${money(sumAmount)}</b></td>
          </tr>`
        : `<tr class="sum">
            <td colspan="16" class="c muted">Continued on next page…</td>
          </tr>`;

      /* One spacer row expands; data rows stay compact (like sample invoices). */
      const spacerRow = `<tr class="spacer">${emptyItemCells()}</tr>`;

      const footer = isLast
        ? `<tr class="foot">
            <td colspan="2" class="foot-left">
              <div class="lbl">Amount in words</div>
              <div class="words">${esc(words)}</div>
              <div class="lbl" style="margin-top:3px">GST Breakup</div>
              <table class="gst">
                <thead>
                  <tr>
                    <th>GST%</th><th>Taxable</th><th>SGST</th><th>CGST</th><th>IGST</th>
                  </tr>
                </thead>
                <tbody>${breakupRows || '<tr><td colspan="5" class="c">—</td></tr>'}</tbody>
              </table>
              <div class="legal">Subject to local jurisdiction · E. &amp; O. E.</div>
            </td>
            <td class="foot-right">
              <table class="tot">
                <tr><td>Discount</td><td class="num">− ${money(sale.discount)}</td></tr>
                <tr><td>Taxable</td><td class="num">${money(sale.subtotal)}</td></tr>
                <tr><td>CGST</td><td class="num">${money(sale.cgst)}</td></tr>
                <tr><td>SGST</td><td class="num">${money(sale.sgst)}</td></tr>
                <tr><td>Round Off</td><td class="num">${roundOff >= 0 ? '+' : ''}${money(roundOff)}</td></tr>
                <tr class="net"><td>Net Amount</td><td class="num">₹ ${money(sale.total)}</td></tr>
              </table>
              <div class="for">For, ${esc(settings.store_name || 'Seller')}</div>
              <div class="sig">Authorized Signatory</div>
            </td>
          </tr>`
        : '';

      return `<div class="page">
        <div class="half">
          <table class="sheet">
            <tr class="head">
              <td class="party">
                <div class="tag">From</div>
                <div class="name">${esc(settings.store_name || 'Seller')}</div>
                ${settings.address ? `<div class="addr">${esc(settings.address)}</div>` : ''}
                ${fromDetails ? `<div class="bits">${fromDetails}</div>` : ''}
              </td>
              <td class="meta">
                <div class="title">Tax Invoice</div>
                <div>Invoice No: <b>${esc(sale.invoice_no)}</b></div>
                <div>Invoice Date: <b>${esc(invoiceDate)}</b></div>
              </td>
              <td class="party">
                <div class="tag">To</div>
                <div class="name">${esc(sale.customer_name || 'Walk-in Customer')}</div>
                ${sale.customer_address ? `<div class="addr">${esc(sale.customer_address)}</div>` : ''}
                ${toDetails ? `<div class="bits">${toDetails}</div>` : ''}
              </td>
            </tr>
            <tr class="grow">
              <td colspan="3" class="pad0">
                <table class="items">
                  <colgroup>
                    <col style="width:3%"/><col style="width:14%"/><col style="width:9%"/><col style="width:5%"/>
                    <col style="width:5%"/><col style="width:6%"/><col style="width:5%"/><col style="width:5%"/>
                    <col style="width:4%"/><col style="width:4%"/><col style="width:5%"/><col style="width:4%"/>
                    <col style="width:7%"/><col style="width:4%"/><col style="width:6%"/><col style="width:8%"/>
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th><th>Item</th><th>Mfg</th><th>Pack</th>
                      <th>HSN</th><th>Batch</th><th>Exp</th><th>MRP</th>
                      <th>Qty</th><th>Free</th><th>Rate</th><th>Disc%</th>
                      <th>Taxable</th><th>GST%</th><th>GST Amt</th><th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>${rows}${spacerRow}${totalsRow}</tbody>
                </table>
              </td>
            </tr>
            ${footer}
            <tr>
              <td colspan="3" class="pager">Page ${pageIdx + 1} of ${pageCount}</td>
            </tr>
          </table>
        </div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(sale.invoice_no)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      color: #111;
      background: #fff;
      font-family: Arial, "Segoe UI", sans-serif;
      font-size: 8px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Full A4 page; invoice lives only in the upper half; lower half stays blank. */
    .page {
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .half {
      width: 100%;
      height: 148.5mm;
      padding: 4mm;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* Outer border always fills the full upper half (blank space under few lines). */
    table.sheet {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      border: 1px solid #444;
      table-layout: fixed;
    }
    table.sheet > tbody > tr > td {
      border: 1px solid #444;
      vertical-align: top;
      padding: 3px 5px;
    }
    /* Items band absorbs leftover height so the outer frame stays full-height. */
    table.sheet > tbody > tr.grow {
      height: 100%;
    }
    table.sheet > tbody > tr > td.pad0 {
      padding: 0 !important;
      border: none !important;
      height: 100%;
      vertical-align: top;
    }

    .party { width: 34%; }
    .meta {
      width: 32%;
      text-align: center;
      background: #f3f4f6;
      vertical-align: middle !important;
    }
    .tag {
      font-size: 6.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #555;
    }
    .name { font-size: 9.5px; font-weight: 700; margin-top: 1px; }
    .addr { color: #333; margin-top: 1px; }
    .bits { margin-top: 1px; color: #333; }
    .bit b { font-weight: 700; color: #555; }
    .title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 2px;
    }

    table.items {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    /* Keep line rows compact; only .spacer absorbs leftover height (like samples). */
    table.items th, table.items td {
      border: 1px solid #444;
      padding: 1px 2px;
      vertical-align: top;
      word-wrap: break-word;
      height: auto;
      line-height: 1.2;
    }
    table.items tr.spacer { height: 100%; }
    table.items tr.spacer td {
      border-top: none;
      vertical-align: top;
      padding: 0;
      font-size: 0;
      line-height: 0;
    }
    /* Header row already draws the top rule; skip items top + side edges. */
    table.items thead th { border-top: none; }
    table.items th:first-child,
    table.items td:first-child { border-left: none; }
    table.items th:last-child,
    table.items td:last-child { border-right: none; }
    table.items th {
      background: #eee;
      font-size: 6px;
      text-transform: uppercase;
      text-align: center;
      white-space: nowrap;
    }
    table.items .c { text-align: center; }
    table.items .num { text-align: right; white-space: nowrap; }
    table.items .amt { font-weight: 700; }
    table.items td.item { font-weight: 600; }
    table.items tr.sum td { background: #eee; font-weight: 700; }
    .muted { color: #555; font-weight: 600; }

    tr.foot > td {
      padding: 3px 5px;
      border-top: none; /* items total row already draws this rule */
    }
    .foot-left { width: 68%; }
    .foot-right {
      width: 32%;
      padding: 0 !important;
      vertical-align: top !important;
      text-align: right;
    }
    .lbl {
      font-size: 6px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555;
    }
    .words { font-size: 8px; font-weight: 600; margin-top: 1px; }
    .legal {
      margin-top: 4px;
      font-size: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #444;
    }
    .for {
      font-weight: 700;
      font-size: 8.5px;
      margin: 8px 6px 0 0;
      text-align: right;
    }
    .sig {
      margin: 16px 6px 4px 0;
      border-top: 1px solid #444;
      display: inline-block;
      padding-top: 2px;
      font-size: 6.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #555;
      text-align: right;
    }

    table.gst, table.tot {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2px;
    }
    table.gst th, table.gst td, table.tot td {
      border: 1px solid #444;
      padding: 1px 3px;
      font-size: 7px;
    }
    table.gst th {
      background: #eee;
      font-size: 6px;
      text-transform: uppercase;
    }
    table.tot td:last-child, table.gst .num { text-align: right; white-space: nowrap; }
    table.gst .c { text-align: center; }
    table.tot tr.net td {
      background: #1e293b;
      color: #fff;
      font-weight: 800;
      font-size: 8.5px;
    }
    /* Totals sit in the right cell — drop edges that would double the sheet border. */
    table.tot td:first-child { border-left: none; }
    table.tot td:last-child { border-right: none; }
    table.tot tr:first-child td { border-top: none; }

    .pager {
      text-align: right !important;
      font-size: 6.5px;
      color: #444;
      padding: 1px 5px !important;
      border: none !important;
    }
  </style>
</head>
<body>
  ${pageHtml}
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
