// GST helpers shared by billing UI and the sales service.
// Sale prices are MRP-inclusive; tax is split evenly into CGST + SGST.

export interface GstLineInput {
  /** Line amount after line-level discount, before bill-level discount share. */
  gross: number;
  gst_rate: number;
}

export interface GstLineAmounts {
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
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
 * Pro-rates a bill-level discount across lines (by pre-discount gross share),
 * then recomputes taxable value and tax per line. Matches CGST Act s.15(3)(a):
 * discounts at the time of supply recorded on the invoice reduce value of supply.
 */
export function allocateOverallDiscount(
  lines: GstLineInput[],
  overallDiscount: number
): GstLineAmounts[] {
  const totalGross = lines.reduce((sum, line) => sum + Math.max(0, line.gross), 0);
  const discount = Math.min(Math.max(0, overallDiscount ?? 0), totalGross);

  if (totalGross <= 0 || discount <= 0) {
    return lines.map((line) => lineGstFromGross(line.gross, line.gst_rate));
  }

  return lines.map((line) => {
    const lineGross = Math.max(0, line.gross);
    const share = discount * (lineGross / totalGross);
    return lineGstFromGross(lineGross - share, line.gst_rate);
  });
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
