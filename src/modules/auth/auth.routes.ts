import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { recordAudit } from '../../common/audit.js';
import { AuthService } from './auth.service.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schema.js';

export default async function authRoutes(app: FastifyInstance) {
  const service = new AuthService(app);
  const ctx = (req: { headers: Record<string, unknown>; ip: string }) => ({
    userAgent: String(req.headers['user-agent'] ?? ''),
    ip: req.ip,
  });

  // Tight per-IP limits on auth endpoints to stop brute-force / credential
  // stuffing and mass account creation (the global limit is far looser).
  const authLimit = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

  app.post('/register', authLimit(5), async (req, reply) => {
    const input = validate(registerSchema, req.body);
    const result = await service.register(input, ctx(req));
    await recordAudit({ userId: result.user.id, action: 'auth.register', entity: 'user', entityId: result.user.id, ipAddress: req.ip });
    return reply.status(201).send(ok(result));
  });

  app.post('/login', authLimit(10), async (req) => {
    const input = validate(loginSchema, req.body);
    const result = await service.login(input, ctx(req));
    await recordAudit({ userId: result.user.id, action: 'auth.login', entity: 'user', entityId: result.user.id, ipAddress: req.ip });
    return ok(result);
  });

  app.post('/refresh', authLimit(20), async (req) => {
    const input = validate(refreshSchema, req.body);
    const result = await service.refresh(input.refreshToken, ctx(req));
    return ok(result);
  });

  app.post('/logout', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(logoutSchema, req.body ?? {});
    const result = await service.logout(input.refreshToken, req.authUser!.id);
    return ok(result);
  });

  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    return ok(await service.me(req.authUser!.id));
  });
}
