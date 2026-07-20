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

/**
 * Applies an invoice-level discount percentage to taxable value, then derives
 * CGST/SGST from the discounted taxable amount (MRP-inclusive prices).
 * Matches typical POS sales and CGST Act s.15(3)(a) for at-supply discounts.
 */
export function applyInvoiceDiscountPercent(
  lines: GstLineInput[],
  discountPercent: number
): InvoiceGstResult {
  const pct = Math.min(Math.max(0, discountPercent ?? 0), 100);
  const factor = 1 - pct / 100;

  const preLines = lines.map((line) => lineGstFromGross(line.gross, line.gst_rate));
  const preTotal = preLines.reduce((sum, line) => sum + line.gross, 0);

  if (pct <= 0 || preTotal <= 0) {
    const totals = sumGstLines(preLines);
    return {
      lines: preLines,
      ...totals,
      discountAmount: 0,
      discountPercent: 0,
    };
  }

  const discountedLines = preLines.map((line, index) => {
    const rate = lines[index].gst_rate ?? 0;
    const discountedTaxable = round2(line.taxable * factor);
    const discountedGross =
      rate > 0 ? round2(discountedTaxable * (1 + rate / 100)) : discountedTaxable;
    const tax = discountedGross - discountedTaxable;
    return {
      gross: discountedGross,
      taxable: discountedTaxable,
      cgst: round2(tax / 2),
      sgst: round2(tax / 2),
    };
  });

  const totals = sumGstLines(discountedLines);
  const discountAmount = round2(preTotal - totals.total);

  return {
    lines: discountedLines,
    ...totals,
    discountAmount,
    discountPercent: pct,
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
