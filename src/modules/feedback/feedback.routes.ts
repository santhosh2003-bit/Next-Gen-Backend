import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { feedbackService } from './feedback.service.js';
import { createFeedbackSchema } from './feedback.schema.js';

export default async function feedbackRoutes(app: FastifyInstance) {
  // Submit feedback. Auth is optional — a signed-in user is linked automatically.
  app.post('/', { onRequest: [app.optionalAuth] }, async (req, reply) => {
    const input = validate(createFeedbackSchema, req.body);
    const created = await feedbackService.create(input, req.authUser?.id ?? null);
    return reply.status(201).send(ok(created));
  });

  // Admin: view submitted feedback.
  app.get(
    '/',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('settings:write')] },
    async (req) => {
      const { items, page, pageSize, total } = await feedbackService.list(req.query as Record<string, unknown>);
      return paginated(items, page, pageSize, total);
    },
  );
}
