import { describe, it, expect } from 'vitest';
import { computeTotals, round2 } from '../src/common/pricing.js';

describe('pricing.round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10)).toBe(10);
  });
});

describe('pricing.computeTotals', () => {
  const lines = [
    { unitPrice: 1000, quantity: 2, taxRate: 18 }, // 2000
    { unitPrice: 500, quantity: 1, taxRate: 18 }, //   500
  ];

  it('computes subtotal and tax with no discount', () => {
    const t = computeTotals(lines);
    expect(t.subtotal).toBe(2500);
    expect(t.discountTotal).toBe(0);
    expect(t.taxTotal).toBe(450); // 18% of 2500
    expect(t.grandTotal).toBe(2950);
  });

  it('applies a flat discount and reduces tax proportionally', () => {
    const t = computeTotals(lines, { discount: 500 });
    expect(t.subtotal).toBe(2500);
    expect(t.discountTotal).toBe(500);
    // taxable base = 2000, tax = 360
    expect(t.taxTotal).toBe(360);
    expect(t.grandTotal).toBe(2360);
  });

  it('caps discount at subtotal', () => {
    const t = computeTotals(lines, { discount: 99999 });
    expect(t.discountTotal).toBe(2500);
    expect(t.grandTotal).toBe(0);
  });

  it('adds shipping to the grand total', () => {
    const t = computeTotals(lines, { shipping: 100 });
    expect(t.shippingTotal).toBe(100);
    expect(t.grandTotal).toBe(3050);
  });
});
