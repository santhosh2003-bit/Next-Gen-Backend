import argon2 from 'argon2';
import { prisma } from './prisma.js';

const ADMIN_EMAIL = 'admin@nextgen.local';
const ADMIN_PASSWORD = 'Admin@12345';

/**
 * Idempotently ensure the essential auth data exists (admin role + admin user +
 * customer role) so the deployed app is usable right after migrations — without
 * needing a shell to run the full seed (Render's free tier has no shell).
 * Safe to run on every boot; never throws into the boot path.
 */
export async function ensureBootstrap(): Promise<void> {
  try {
    const adminRole = await prisma.role.upsert({
      where: { name: 'admin' },
      create: { name: 'admin', description: 'Full access', isSystem: true },
      update: {},
    });
    await prisma.role.upsert({
      where: { name: 'customer' },
      create: { name: 'customer', description: 'Storefront customer', isSystem: true },
      update: {},
    });

    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!existing) {
      const admin = await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash: await argon2.hash(ADMIN_PASSWORD),
          firstName: 'Platform',
          lastName: 'Admin',
          emailVerified: true,
        },
      });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    } else {
      // Keep the admin's role link intact (don't touch the password on updates).
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: existing.id, roleId: adminRole.id } },
        create: { userId: existing.id, roleId: adminRole.id },
        update: {},
      });
    }
  } catch (err) {
    // Never block startup on bootstrap; log and continue.
    // eslint-disable-next-line no-console
    console.error('ensureBootstrap failed:', (err as Error).message);
  }
}
