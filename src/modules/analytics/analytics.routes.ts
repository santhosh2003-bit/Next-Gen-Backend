import type { FastifyInstance } from 'fastify';
import { prisma } from '../../common/prisma.js';
import { ok, paginated, parsePagination } from '../../common/response.js';
import { analyticsService } from './analytics.service.js';

export default async function analyticsRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('analytics:read')] };

  app.get('/dashboard', guard, async () => ok(await analyticsService.dashboard()));
  app.get('/revenue-by-status', guard, async () => ok(await analyticsService.revenueByStatus()));
  app.get('/top-products', guard, async (req) => {
    const { limit } = req.query as { limit?: string };
    return ok(await analyticsService.topProducts(Number(limit) || 10));
  });
  app.get('/recent-orders', guard, async () => ok(await analyticsService.recentOrders()));

  // Audit log viewer (admin).
  app.get(
    '/audit-logs',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('audit:read')] },
    async (req) => {
      const { page, pageSize, skip, take } = parsePagination(req.query as never);
      const { entity, action } = req.query as { entity?: string; action?: string };
      const where = { ...(entity ? { entity } : {}), ...(action ? { action } : {}) };
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        prisma.auditLog.count({ where }),
      ]);
      return paginated(items, page, pageSize, total);
    },
  );
}
