// GST helpers shared by the sales UI and the sales service.
// Sale rates are GST-exclusive; tax is split evenly into CGST + SGST.

export interface GstLineInput {
  gross: number;
  gst_rate: number;
}

export interface GstLineAmounts {
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
  /** CGST + SGST for the line. */
  gstAmount: number;
}

export interface InvoiceGstResult {
  lines: GstLineAmounts[];
  subtotal: number;
  cgst: number;
  sgst: number;
  /** Pre-round total (taxable + tax). */
  rawTotal: number;
  /** Adjustment to nearest rupee (can be negative). */
  roundOff: number;
  /** Net payable after round-off. */
  total: number;
  /** Rupee amount saved by line discounts. */
  discountAmount: number;
  discountPercent: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Line amounts from a GST-exclusive base amount (no discount). */
export function lineGstFromGross(gross: number, gstRate: number): GstLineAmounts {
  const rate = gstRate ?? 0;
  const taxable = round2(Math.max(0, gross));
  const tax = rate > 0 ? round2(taxable * (rate / 100)) : 0;
  const cgst = round2(tax / 2);
  const sgst = round2(tax / 2);
  return {
    gross: round2(taxable + tax),
    taxable,
    cgst,
    sgst,
    gstAmount: round2(cgst + sgst),
  };
}

export interface SaleLineInput extends GstLineInput {
  discount_percent: number;
}

export interface SaleLineAmounts extends GstLineAmounts {
  discountAmount: number;
  discountPercent: number;
}

/**
 * Sale line amounts from a GST-exclusive rate × qty.
 * Taxable = gross × (1 − disc%), GST on taxable, line total = taxable + CGST + SGST.
 */
export function saleLineAmounts(input: SaleLineInput): SaleLineAmounts {
  const disc = Math.min(Math.max(0, input.discount_percent ?? 0), 100);
  const rate = input.gst_rate ?? 0;
  const grossBefore = Math.max(0, input.gross);
  const taxable = round2(grossBefore * (1 - disc / 100));
  const tax = rate > 0 ? round2(taxable * (rate / 100)) : 0;
  const cgst = round2(tax / 2);
  const sgst = round2(tax / 2);
  const lineTotal = round2(taxable + tax);

  return {
    gross: lineTotal,
    taxable,
    cgst,
    sgst,
    gstAmount: round2(cgst + sgst),
    discountAmount: round2(grossBefore - taxable),
    discountPercent: disc,
  };
}

/** Aggregates per-line sale amounts (each line carries its own discount %). */
export function computeSaleInvoice(lines: SaleLineInput[]): InvoiceGstResult {
  const computed = lines.map(saleLineAmounts);
  const totals = sumGstLines(computed);
  const discountAmount = round2(computed.reduce((sum, line) => sum + line.discountAmount, 0));
  const rawTotal = totals.total;
  const netTotal = Math.round(rawTotal);
  const roundOff = round2(netTotal - rawTotal);

  return {
    lines: computed,
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    rawTotal,
    roundOff,
    total: netTotal,
    discountAmount,
    discountPercent: 0,
  };
}

export function sumGstLines(lines: GstLineAmounts[]): {
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
} {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let total = 0;
  for (const line of lines) {
    subtotal += line.taxable;
    cgst += line.cgst;
    sgst += line.sgst;
    total += line.gross;
  }
  return {
    subtotal: round2(subtotal),
    cgst: round2(cgst),
    sgst: round2(sgst),
    total: round2(total),
  };
}

/** Round-off implied by a stored sale (net total vs taxable + tax). */
export function saleRoundOff(sale: {
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
}): number {
  const raw = round2((sale.subtotal ?? 0) + (sale.cgst ?? 0) + (sale.sgst ?? 0));
  return round2((sale.total ?? 0) - raw);
}

/** Purchase line amounts from distributor rate (GST-exclusive) after line discount. */
export function purchaseLineAmounts(input: {
  purchase_price: number;
  discount_percent: number;
  quantity: number;
  gst_rate: number;
}): {
  net_rate: number;
  taxable_value: number;
  line_total: number;
  discount_amount: number;
  gst_amount: number;
} {
  const disc = Math.min(Math.max(0, input.discount_percent ?? 0), 100);
  const qty = Math.max(0, input.quantity ?? 0);
  const rate = input.gst_rate ?? 0;
  const gross = round2(Math.max(0, input.purchase_price) * qty);
  const net_rate = round2(Math.max(0, input.purchase_price) * (1 - disc / 100));
  const taxable_value = round2(net_rate * qty);
  const discount_amount = round2(gross - taxable_value);
  const line_total = round2(taxable_value * (1 + rate / 100));
  const gst_amount = round2(line_total - taxable_value);
  return { net_rate, taxable_value, line_total, discount_amount, gst_amount };
}

/** Sums purchase line amounts for an invoice. */
export function purchaseInvoiceTotals(
  items: Array<{
    purchase_price: number;
    discount_percent: number;
    quantity: number;
    gst_rate: number;
  }>
): {
  discount: number;
  taxable: number;
  gst: number;
  total: number;
} {
  return items.reduce(
    (acc, it) => {
      const line = purchaseLineAmounts(it);
      return {
        discount: round2(acc.discount + line.discount_amount),
        taxable: round2(acc.taxable + line.taxable_value),
        gst: round2(acc.gst + line.gst_amount),
        total: round2(acc.total + line.line_total),
      };
    },
    { discount: 0, taxable: 0, gst: 0, total: 0 }
  );
}

/** Landing cost per paid unit (after discount, incl. GST). */
export function purchaseLandingCost(
  line: Pick<
    { purchase_price: number; discount_percent: number; quantity: number; gst_rate: number },
    'purchase_price' | 'discount_percent' | 'quantity' | 'gst_rate'
  >
): number {
  const { line_total } = purchaseLineAmounts(line);
  if (line.quantity <= 0) return purchaseLineAmounts({ ...line, quantity: 1 }).net_rate * (1 + (line.gst_rate ?? 0) / 100);
  return round2(line_total / line.quantity);
}
