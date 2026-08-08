import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/common/prisma.js";

const adminCredentials = {
  email: "api-admin@nextgen.local",
  password: "Admin@12345",
};
const managerCredentials = {
  email: "api-manager@nextgen.local",
  password: "Manager@12345",
};
const categorySlug = "test-admin-category";
const brandSlug = "test-admin-brand";
const productSku = `TEST-PRODUCT-${Date.now()}`;
const productName = "Test Admin Product";

let app: FastifyInstance;
let accessToken: string;
let managerToken: string;
let categoryId: string;
let brandId: string;
let productId: string;
let productSlug: string;
let adminUserId: string;
let managerUserId: string;

async function injectJson(options: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  payload?: unknown;
  token?: string;
}) {
  const response = await app.inject({
    method: options.method,
    url: options.url,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    payload: options.payload,
  });
  return JSON.parse(response.body) as Record<string, unknown>;
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  app = await buildApp();
  await app.ready();

  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    create: { name: "admin", description: "Admin role", isSystem: true },
    update: {},
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "manager" },
    create: { name: "manager", description: "Manager role", isSystem: true },
    update: {},
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminCredentials.email },
    create: {
      email: adminCredentials.email,
      passwordHash: await argon2.hash(adminCredentials.password),
      firstName: "API",
      lastName: "Admin",
      emailVerified: true,
      roles: { create: { roleId: adminRole.id } },
    },
    update: {
      passwordHash: await argon2.hash(adminCredentials.password),
      firstName: "API",
      lastName: "Admin",
      emailVerified: true,
    },
  });
  adminUserId = adminUser.id;

  const managerUser = await prisma.user.upsert({
    where: { email: managerCredentials.email },
    create: {
      email: managerCredentials.email,
      passwordHash: await argon2.hash(managerCredentials.password),
      firstName: "API",
      lastName: "Manager",
      emailVerified: true,
      roles: { create: { roleId: managerRole.id } },
    },
    update: {
      passwordHash: await argon2.hash(managerCredentials.password),
      firstName: "API",
      lastName: "Manager",
      emailVerified: true,
    },
  });
  managerUserId = managerUser.id;

  const category = await prisma.category.upsert({
    where: { slug: categorySlug },
    create: { name: "Admin Test Category", slug: categorySlug },
    update: {},
  });
  categoryId = category.id;

  const brand = await prisma.brand.upsert({
    where: { slug: brandSlug },
    create: { name: "Admin Test Brand", slug: brandSlug },
    update: {},
  });
  brandId = brand.id;

  const loginResponse = await injectJson({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: adminCredentials.email,
      password: adminCredentials.password,
    },
  });

  const managerLoginResponse = await injectJson({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: managerCredentials.email,
      password: managerCredentials.password,
    },
  });

  expect(loginResponse.success).toBe(true);
  expect(managerLoginResponse.success).toBe(true);
  accessToken = (loginResponse.data as Record<string, unknown>)
    .accessToken as string;
  managerToken = (managerLoginResponse.data as Record<string, unknown>)
    .accessToken as string;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { sku: productSku } });
  await prisma.userSession.deleteMany({ where: { userId: adminUserId } });
  await prisma.userSession.deleteMany({ where: { userId: managerUserId } });
  await prisma.user.deleteMany({ where: { email: adminCredentials.email } });
  await prisma.user.deleteMany({ where: { email: managerCredentials.email } });
  await app.close();
});

describe("Admin product endpoints", () => {
  it("should return admin identity from /auth/me after login", async () => {
    const meResponse = await injectJson({
      method: "GET",
      url: "/api/v1/auth/me",
      token: accessToken,
    });

    expect(meResponse.success).toBe(true);
    expect((meResponse.data as Record<string, unknown>).roles).toContain(
      "admin",
    );
  });

  it("should allow manager to access admin product listing", async () => {
    const meResponse = await injectJson({
      method: "GET",
      url: "/api/v1/auth/me",
      token: managerToken,
    });

    expect(meResponse.success).toBe(true);
    expect((meResponse.data as Record<string, unknown>).roles).toContain(
      "manager",
    );

    const adminProductsResponse = await injectJson({
      method: "GET",
      url: "/api/v1/products/admin/all",
      token: managerToken,
    });

    expect(adminProductsResponse.success).toBe(true);
  });

  it("should create, update, and delete a product as admin", async () => {
    const createResponse = await injectJson({
      method: "POST",
      url: "/api/v1/products",
      token: accessToken,
      payload: {
        name: productName,
        sku: productSku,
        categoryId,
        brandId,
        price: 1299,
        shortDescription: "Test product for admin flow",
      },
    });

    expect(createResponse.success).toBe(true);
    const created = createResponse.data as Record<string, unknown>;
    productId = created.id as string;
    productSlug = created.slug as string;
    expect(created.sku).toBe(productSku);
    expect(created.name).toBe(productName);

    const updateResponse = await injectJson({
      method: "PATCH",
      url: `/api/v1/products/${productId}`,
      token: accessToken,
      payload: {
        price: 1499,
        shortDescription: "Updated admin product description",
      },
    });

    expect(updateResponse.success).toBe(true);
    const updated = updateResponse.data as Record<string, unknown>;
    expect(updated.price).toBe("1499");
    expect(updated.shortDescription).toBe("Updated admin product description");

    const deleteResponse = await injectJson({
      method: "DELETE",
      url: `/api/v1/products/${productId}`,
      token: accessToken,
    });

    expect(deleteResponse.success).toBe(true);

    const publicResponse = await app.inject({
      method: "GET",
      url: `/api/v1/products/${productSlug}`,
    });

    expect(publicResponse.statusCode).toBe(404);
  });
});
