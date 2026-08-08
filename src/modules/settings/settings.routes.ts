import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { recordAudit } from '../../common/audit.js';
import { settingsService } from './settings.service.js';
import { siteSettingsSchema } from './settings.schema.js';

export default async function settingsRoutes(app: FastifyInstance) {
  // Public: the app reads the org profile + app name to render everywhere.
  app.get('/', async () => ok(await settingsService.getSite()));

  // Admin: update the organisation profile / app name / contact details.
  app.put(
    '/',
    { onRequest: [app.authenticate], preHandler: [app.requirePermissions('settings:write')] },
    async (req) => {
      const input = validate(siteSettingsSchema, req.body);
      const updated = await settingsService.updateSite(input);
      await recordAudit({
        userId: req.authUser!.id,
        action: 'settings.update',
        entity: 'settings',
        entityId: 'site',
        metadata: { fields: Object.keys(input) },
        ipAddress: req.ip,
      });
      return ok(updated);
    },
  );
}
