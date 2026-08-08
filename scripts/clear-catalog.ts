/**
 * Wipes seeded/demo catalog + transactional data so the admin starts clean.
 * PRESERVES: users, roles, permissions, addresses, warehouses, site settings,
 * advertisements, feedback, product requests, audit logs, notifications.
 *
 * Run:  npx tsx scripts/clear-catalog.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Order matters — delete children before parents to satisfy FKs.
  const steps: [string, () => Promise<unknown>][] = [
    ['paymentTransactions', () => prisma.paymentTransaction.deleteMany()],
    ['payments', () => prisma.payment.deleteMany()],
    ['razorpayWebhooks', () => prisma.razorpayWebhook.deleteMany()],
    ['couponUsages', () => prisma.couponUsage.deleteMany()],
    ['orderStatusHistory', () => prisma.orderStatusHistory.deleteMany()],
    ['orderItems', () => prisma.orderItem.deleteMany()],
    ['orders', () => prisma.order.deleteMany()],
    ['cartItems', () => prisma.cartItem.deleteMany()],
    ['carts', () => prisma.cart.deleteMany()],
    ['wishlistItems', () => prisma.wishlistItem.deleteMany()],
    ['reviews', () => prisma.review.deleteMany()],
    ['stockMovements', () => prisma.stockMovement.deleteMany()],
    ['inventory', () => prisma.inventory.deleteMany()],
    ['productImages', () => prisma.productImage.deleteMany()],
    ['productVariants', () => prisma.productVariant.deleteMany()],
    ['products', () => prisma.product.deleteMany()],
    ['coupons', () => prisma.coupon.deleteMany()],
    ['brands', () => prisma.brand.deleteMany()],
    ['categories', () => prisma.category.deleteMany()],
  ];

  for (const [label, run] of steps) {
    const res = (await run()) as { count: number };
    // eslint-disable-next-line no-console
    console.log(`cleared ${label}: ${res.count}`);
  }
  // eslint-disable-next-line no-console
  console.log('✅ Catalog cleared. Admin, roles and settings are preserved.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
