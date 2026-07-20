// GST helpers shared by the sales UI and the sales service.
// Sale prices are MRP-inclusive; tax is split evenly into CGST + SGST.

export interface GstLineInput {
  gross: number;
  gst_rate: number;
}

export interface GstLineAmounts {
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface InvoiceGstResult {
  lines: GstLineAmounts[];
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  /** Rupee amount saved by the invoice discount. */
  discountAmount: number;
  discountPercent: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineGstFromGross(gross: number, gstRate: number): GstLineAmounts {
  const rate = gstRate ?? 0;
  const safeGross = Math.max(0, gross);
  const taxable = rate > 0 ? safeGross / (1 + rate / 100) : safeGross;
  const tax = safeGross - taxable;
  return {
    gross: round2(safeGross),
    taxable: round2(taxable),
    cgst: round2(tax / 2),
    sgst: round2(tax / 2),
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
 * Sale line amounts from MRP-inclusive gross after a line discount on taxable value.
 * Taxable value = gross / (1 + rate/100), discounted, then GST is applied; line total
 * = discounted taxable + CGST + SGST.
 */
export function saleLineAmounts(input: SaleLineInput): SaleLineAmounts {
  const disc = Math.min(Math.max(0, input.discount_percent ?? 0), 100);
  const rate = input.gst_rate ?? 0;
  const grossBefore = Math.max(0, input.gross);
  const preTaxable = rate > 0 ? grossBefore / (1 + rate / 100) : grossBefore;
  const discountedTaxable = round2(preTaxable * (1 - disc / 100));
  const lineTotal =
    rate > 0 ? round2(discountedTaxable * (1 + rate / 100)) : discountedTaxable;
  const tax = lineTotal - discountedTaxable;

  return {
    gross: lineTotal,
    taxable: discountedTaxable,
    cgst: round2(tax / 2),
    sgst: round2(tax / 2),
    discountAmount: round2(grossBefore - lineTotal),
    discountPercent: disc,
  };
}

/** Aggregates per-line sale amounts (each line carries its own discount %). */
export function computeSaleInvoice(lines: SaleLineInput[]): InvoiceGstResult {
  const computed = lines.map(saleLineAmounts);
  const totals = sumGstLines(computed);
  const discountAmount = round2(computed.reduce((sum, line) => sum + line.discountAmount, 0));

  return {
    lines: computed,
    ...totals,
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

/** Purchase line amounts from distributor rate (GST-exclusive) after line discount. */
export function purchaseLineAmounts(input: {
  purchase_price: number;
  discount_percent: number;
  quantity: number;
  gst_rate: number;
}): { net_rate: number; taxable_value: number; line_total: number } {
  const disc = Math.min(Math.max(0, input.discount_percent ?? 0), 100);
  const qty = Math.max(0, input.quantity ?? 0);
  const rate = input.gst_rate ?? 0;
  const net_rate = round2(Math.max(0, input.purchase_price) * (1 - disc / 100));
  const taxable_value = round2(net_rate * qty);
  const line_total = round2(taxable_value * (1 + rate / 100));
  return { net_rate, taxable_value, line_total };
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
