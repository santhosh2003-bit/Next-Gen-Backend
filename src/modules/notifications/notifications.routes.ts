import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../common/prisma.js';
import { ok, paginated, parsePagination } from '../../common/response.js';
import { validate } from '../../common/validation.js';

const registerTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['ios', 'android', 'web']),
});

export default async function notificationsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    const { page, pageSize, skip, take } = parsePagination(req.query as never);
    const where = { userId: req.authUser!.id };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...paginated(items, page, pageSize, total), unread };
  });

  app.post('/:id/read', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.notification.updateMany({
      where: { id, userId: req.authUser!.id },
      data: { readAt: new Date(), status: 'READ' },
    });
    return ok({ success: true });
  });

  app.post('/read-all', async (req) => {
    await prisma.notification.updateMany({
      where: { userId: req.authUser!.id, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return ok({ success: true });
  });

  // Register a device push token (Expo / FCM / APNs).
  app.post('/push-tokens', async (req, reply) => {
    const input = validate(registerTokenSchema, req.body);
    const token = await prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId: req.authUser!.id, token: input.token, platform: input.platform },
      update: { userId: req.authUser!.id, platform: input.platform },
    });
    return reply.status(201).send(ok(token));
  });

  app.delete('/push-tokens/:token', async (req) => {
    const { token } = req.params as { token: string };
    await prisma.pushToken.deleteMany({ where: { token, userId: req.authUser!.id } });
    return ok({ success: true });
  });
}
