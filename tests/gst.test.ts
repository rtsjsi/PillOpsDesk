import { describe, expect, it } from 'vitest';
import {
  applyInvoiceDiscountPercent,
  lineGstFromGross,
  round2,
} from '@shared/gst';

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.999)).toBe(11);
  });
});

describe('lineGstFromGross', () => {
  it('splits 12% GST-inclusive price into taxable + CGST + SGST', () => {
    const line = lineGstFromGross(112, 12);
    expect(line.taxable).toBe(100);
    expect(line.cgst).toBe(6);
    expect(line.sgst).toBe(6);
    expect(line.gross).toBe(112);
  });

  it('treats 0% GST as fully taxable', () => {
    const line = lineGstFromGross(100, 0);
    expect(line.taxable).toBe(100);
    expect(line.cgst).toBe(0);
    expect(line.sgst).toBe(0);
  });

  it('handles 18% GST', () => {
    const line = lineGstFromGross(118, 18);
    expect(line.taxable).toBe(100);
    expect(line.cgst + line.sgst).toBe(18);
  });
});

describe('applyInvoiceDiscountPercent', () => {
  it('returns unchanged totals when discount is 0', () => {
    const result = applyInvoiceDiscountPercent(
      [{ gross: 112, gst_rate: 12 }],
      0
    );
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(112);
    expect(result.subtotal).toBe(100);
    expect(result.cgst).toBe(6);
    expect(result.sgst).toBe(6);
  });

  it('applies 10% invoice discount to taxable value', () => {
    const result = applyInvoiceDiscountPercent(
      [{ gross: 112, gst_rate: 12 }],
      10
    );
    expect(result.discountPercent).toBe(10);
    expect(result.discountAmount).toBe(11.2);
    expect(result.total).toBe(100.8);
    expect(result.subtotal).toBe(90);
    expect(result.cgst).toBe(5.4);
    expect(result.sgst).toBe(5.4);
  });

  it('sums mixed GST rates correctly', () => {
    const result = applyInvoiceDiscountPercent(
      [
        { gross: 112, gst_rate: 12 },
        { gross: 105, gst_rate: 5 },
      ],
      0
    );
    expect(result.total).toBe(217);
    expect(result.cgst + result.sgst + result.subtotal).toBeCloseTo(217, 2);
  });

  it('clamps discount above 100% to 100', () => {
    const result = applyInvoiceDiscountPercent(
      [{ gross: 100, gst_rate: 0 }],
      150
    );
    expect(result.total).toBe(0);
    expect(result.discountAmount).toBe(100);
  });
});
