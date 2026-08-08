/**
 * Money helpers. All monetary math is done in plain numbers rounded to 2dp;
 * Prisma Decimal is only used at the persistence boundary.
 */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineInput {
  unitPrice: number;
  quantity: number;
  taxRate: number; // percent
}

export interface Totals {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shippingTotal: number;
  grandTotal: number;
}

/**
 * Compute order totals. Discount applies to subtotal; tax is computed on the
 * post-discount, proportional line value.
 */
export function computeTotals(
  lines: LineInput[],
  opts: { discount?: number; shipping?: number } = {},
): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const discountTotal = round2(Math.min(opts.discount ?? 0, subtotal));
  const shippingTotal = round2(opts.shipping ?? 0);

  const discountRatio = subtotal > 0 ? (subtotal - discountTotal) / subtotal : 0;
  const taxTotal = round2(
    lines.reduce((s, l) => s + l.unitPrice * l.quantity * discountRatio * (l.taxRate / 100), 0),
  );

  const grandTotal = round2(subtotal - discountTotal + taxTotal + shippingTotal);
  return { subtotal, taxTotal, discountTotal, shippingTotal, grandTotal };
}
