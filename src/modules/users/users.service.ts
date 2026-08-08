import argon2 from 'argon2';
import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { parsePagination } from '../../common/response.js';
import type { z } from 'zod';
import type { addressSchema, updateProfileSchema } from './users.schema.js';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

export const usersService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user) throw new NotFoundError('User not found');
    return user;
  },

  async updateProfile(userId: string, input: z.infer<typeof updateProfileSchema>) {
    return prisma.user.update({ where: { id: userId }, data: input, select: userSelect });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new BadRequestError('Current password is incorrect');
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword) },
    });
    // Revoke all sessions to force re-login everywhere.
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  },

  // ── Addresses ──────────────────────────────────────────
  async listAddresses(userId: string) {
    return prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  },

  async createAddress(userId: string, input: z.infer<typeof addressSchema>) {
    if (input.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return prisma.address.create({ data: { ...input, userId } });
  },

  async updateAddress(userId: string, id: string, input: Partial<z.infer<typeof addressSchema>>) {
    const address = await prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundError('Address not found');
    if (input.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return prisma.address.update({ where: { id }, data: input });
  },

  async deleteAddress(userId: string, id: string) {
    const address = await prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundError('Address not found');
    await prisma.address.delete({ where: { id } });
    return { success: true };
  },

  // ── Admin ──────────────────────────────────────────────
  async listUsers(query: { page?: unknown; pageSize?: unknown; search?: string; status?: string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  async setStatus(userId: string, status: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    return prisma.user.update({
      where: { id: userId },
      data: { status: status as never, deletedAt: status === 'DELETED' ? new Date() : null },
      select: userSelect,
    });
  },

  async assignRole(userId: string, roleId: string) {
    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!user) throw new NotFoundError('User not found');
    if (!role) throw new NotFoundError('Role not found');
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    return { success: true };
  },

  async removeRole(userId: string, roleId: string) {
    await prisma.userRole.deleteMany({ where: { userId, roleId } });
    return { success: true };
  },
};
