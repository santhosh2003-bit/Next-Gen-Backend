import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { usersService } from './users.service.js';
import {
  addressSchema,
  assignRoleSchema,
  changePasswordSchema,
  updateProfileSchema,
  updateUserStatusSchema,
} from './users.schema.js';

export default async function usersRoutes(app: FastifyInstance) {
  // ── Current user ──────────────────────────────────────
  app.get('/me', { onRequest: [app.authenticate] }, async (req) =>
    ok(await usersService.getProfile(req.authUser!.id)),
  );

  app.patch('/me', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(updateProfileSchema, req.body);
    return ok(await usersService.updateProfile(req.authUser!.id, input));
  });

  app.post('/me/change-password', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(changePasswordSchema, req.body);
    return ok(await usersService.changePassword(req.authUser!.id, input.currentPassword, input.newPassword));
  });

  // ── Addresses ─────────────────────────────────────────
  app.get('/me/addresses', { onRequest: [app.authenticate] }, async (req) =>
    ok(await usersService.listAddresses(req.authUser!.id)),
  );

  app.post('/me/addresses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const input = validate(addressSchema, req.body);
    return reply.status(201).send(ok(await usersService.createAddress(req.authUser!.id, input)));
  });

  app.patch('/me/addresses/:id', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(addressSchema.partial(), req.body);
    const { id } = req.params as { id: string };
    return ok(await usersService.updateAddress(req.authUser!.id, id, input));
  });

  app.delete('/me/addresses/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await usersService.deleteAddress(req.authUser!.id, id));
  });

  // ── Admin ─────────────────────────────────────────────
  app.get(
    '/',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:read')] },
    async (req) => {
      const { items, page, pageSize, total } = await usersService.listUsers(req.query as never);
      return paginated(items, page, pageSize, total);
    },
  );

  // Customers list with order count + lifetime paid spend.
  app.get(
    '/customers',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:read')] },
    async (req) => {
      const { items, page, pageSize, total } = await usersService.listCustomers(req.query as never);
      return paginated(items, page, pageSize, total);
    },
  );

  // A single customer's profile + order history.
  app.get(
    '/:id/orders',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:read')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return ok(await usersService.customerOrders(id));
    },
  );

  app.patch(
    '/:id/status',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:update')] },
    async (req) => {
      const input = validate(updateUserStatusSchema, req.body);
      const { id } = req.params as { id: string };
      return ok(await usersService.setStatus(id, input.status));
    },
  );

  app.post(
    '/:id/roles',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:update')] },
    async (req) => {
      const input = validate(assignRoleSchema, req.body);
      const { id } = req.params as { id: string };
      return ok(await usersService.assignRole(id, input.roleId));
    },
  );

  app.delete(
    '/:id/roles/:roleId',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('user:update')] },
    async (req) => {
      const { id, roleId } = req.params as { id: string; roleId: string };
      return ok(await usersService.removeRole(id, roleId));
    },
  );
}
