import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Local slug helper (kept self-contained so the seed has no src/ imports). */
function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** All permission keys used by route guards across modules. */
const PERMISSIONS = [
  "user:read",
  "user:update",
  "product:write",
  "category:write",
  "brand:write",
  "inventory:read",
  "inventory:write",
  "order:manage",
  "payment:refund",
  "coupon:write",
  "review:moderate",
  "analytics:read",
  "audit:read",
];

async function main() {
  console.log("🌱 Seeding database...");

  // ── Permissions ────────────────────────────────────────
  await Promise.all(
    PERMISSIONS.map((key) =>
      prisma.permission.upsert({ where: { key }, create: { key }, update: {} }),
    ),
  );
  const permissions = await prisma.permission.findMany();

  // ── Roles ──────────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    create: { name: "admin", description: "Full access", isSystem: true },
    update: {},
  });
  const managerRole = await prisma.role.upsert({
    where: { name: "manager" },
    create: {
      name: "manager",
      description: "Catalog & orders",
      isSystem: true,
    },
    update: {},
  });
  const customerRole = await prisma.role.upsert({
    where: { name: "customer" },
    create: {
      name: "customer",
      description: "Storefront customer",
      isSystem: true,
    },
    update: {},
  });

  // Admin gets every permission.
  for (const p of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: p.id },
      },
      create: { roleId: adminRole.id, permissionId: p.id },
      update: {},
    });
  }
  // Manager gets catalog + orders + inventory.
  const managerPerms = permissions.filter((p) =>
    [
      "product:write",
      "category:write",
      "brand:write",
      "inventory:read",
      "inventory:write",
      "order:manage",
      "coupon:write",
      "review:moderate",
      "analytics:read",
    ].includes(p.key),
  );
  for (const p of managerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: managerRole.id, permissionId: p.id },
      },
      create: { roleId: managerRole.id, permissionId: p.id },
      update: {},
    });
  }

  // ── Admin user ─────────────────────────────────────────
  const adminEmail = "admin@nextgen.local";
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await argon2.hash("Admin@12345"),
      firstName: "Platform",
      lastName: "Admin",
      emailVerified: true,
    },
    update: {
      passwordHash: await argon2.hash("Admin@12345"),
      firstName: "Platform",
      lastName: "Admin",
      emailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  const managerEmail = "manager@nextgen.local";
  const manager = await prisma.user.upsert({
    where: { email: managerEmail },
    create: {
      email: managerEmail,
      passwordHash: await argon2.hash("Manager@12345"),
      firstName: "Platform",
      lastName: "Manager",
      emailVerified: true,
    },
    update: {
      passwordHash: await argon2.hash("Manager@12345"),
      firstName: "Platform",
      lastName: "Manager",
      emailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: manager.id, roleId: managerRole.id } },
    create: { userId: manager.id, roleId: managerRole.id },
    update: {},
  });

  console.log(`👤 Admin: ${adminEmail} / Admin@12345`);
  console.log(`👤 Manager: ${managerEmail} / Manager@12345`);

  // A demo customer.
  const customer = await prisma.user.upsert({
    where: { email: "customer@nextgen.local" },
    create: {
      email: "customer@nextgen.local",
      passwordHash: await argon2.hash("Customer@123"),
      firstName: "Demo",
      lastName: "Customer",
      emailVerified: true,
    },
    update: {
      passwordHash: await argon2.hash("Customer@123"),
      firstName: "Demo",
      lastName: "Customer",
      emailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: customer.id, roleId: customerRole.id },
    },
    create: { userId: customer.id, roleId: customerRole.id },
    update: {},
  });

  // ── Warehouse ──────────────────────────────────────────
  const warehouse = await prisma.warehouse.upsert({
    where: { code: "WH-MAIN" },
    create: {
      name: "Main Warehouse",
      code: "WH-MAIN",
      address: "Mumbai, India",
    },
    update: {},
  });

  // ── Categories ─────────────────────────────────────────
  const categoryData = [
    "Electronics",
    "Fashion",
    "Home & Kitchen",
    "Books",
    "Fitness",
  ];
  const categories: Record<string, string> = {};
  for (const name of categoryData) {
    const c = await prisma.category.upsert({
      where: { slug: slugify(name) },
      create: { name, slug: slugify(name) },
      update: {},
    });
    categories[name] = c.id;
  }

  // ── Brands ─────────────────────────────────────────────
  const brandData = ["NextGen", "Acme", "Globex"];
  const brands: Record<string, string> = {};
  for (const name of brandData) {
    const b = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      create: { name, slug: slugify(name) },
      update: {},
    });
    brands[name] = b.id;
  }

  // ── Products ───────────────────────────────────────────
  const productData = [
    {
      name: "Wireless Noise-Cancelling Headphones",
      category: "Electronics",
      brand: "NextGen",
      price: 12999,
      sale: 9999,
    },
    {
      name: "Smart Fitness Watch",
      category: "Electronics",
      brand: "Acme",
      price: 8999,
      sale: 6999,
    },
    {
      name: "Cotton Casual T-Shirt",
      category: "Fashion",
      brand: "Globex",
      price: 799,
      sale: 599,
    },
    {
      name: "Stainless Steel Cookware Set",
      category: "Home & Kitchen",
      brand: "Acme",
      price: 4999,
      sale: null,
    },
    {
      name: "The Pragmatic Programmer",
      category: "Books",
      brand: "NextGen",
      price: 1499,
      sale: 1199,
    },
    {
      name: "4K Ultra HD Action Camera",
      category: "Electronics",
      brand: "Globex",
      price: 15999,
      sale: 12999,
    },
    {
      name: "Eco-Friendly Yoga Mat",
      category: "Fitness",
      brand: "NextGen",
      price: 2499,
      sale: 1999,
    },
    {
      name: "Designer Travel Backpack",
      category: "Fashion",
      brand: "Acme",
      price: 6999,
      sale: 5499,
    },
    {
      name: "Bluetooth Speaker Tower",
      category: "Electronics",
      brand: "Globex",
      price: 7999,
      sale: 6499,
    },
  ];

  for (const [i, p] of productData.entries()) {
    const sku = `SKU-${1000 + i}`;
    const product = await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        name: p.name,
        slug: slugify(p.name),
        categoryId: categories[p.category],
        brandId: brands[p.brand],
        shortDescription: `${p.name} — premium quality.`,
        description: `Detailed description for ${p.name}. Built to last, backed by warranty.`,
        price: p.price,
        salePrice: p.sale ?? undefined,
        taxRate: 18,
        status: "ACTIVE",
        images: {
          create: [
            {
              url: `https://picsum.photos/seed/${sku}/600/600`,
              isPrimary: true,
              position: 0,
            },
          ],
        },
      },
      update: {},
    });

    // Stock (findFirst + create because variantId is null in the compound unique)
    const existingInv = await prisma.inventory.findFirst({
      where: {
        productId: product.id,
        variantId: null,
        warehouseId: warehouse.id,
      },
    });
    if (!existingInv) {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 100,
          reorderLevel: 10,
        },
      });
    }
  }

  // ── Coupon ─────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    create: {
      code: "WELCOME10",
      type: "PERCENTAGE",
      value: 10,
      minOrder: 500,
      maxDiscount: 2000,
      perUserLimit: 1,
      isActive: true,
    },
    update: {},
  });

  console.log("✅ Seed complete.");
  console.log(`   Admin:    admin@nextgen.local / Admin@12345`);
  console.log(`   Customer: customer@nextgen.local / Customer@123`);
  console.log(`   Coupon:   WELCOME10 (10% off, min ₹500)`);
  void admin;
  void customer;
  void managerRole;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
