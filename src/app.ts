import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { mkdirSync } from 'node:fs';
import { env, isProd, UPLOAD_ROOT } from './config/env.js';
import { loggerConfig } from './common/logger.js';
import { ok } from './common/response.js';
import authPlugin from './plugins/auth.js';
import errorHandler from './plugins/errorHandler.js';
import { registerRoutes } from './routes/index.js';
import { prisma } from './common/prisma.js';
import { redis } from './common/redis.js';

/**
 * Build and fully configure the Fastify instance (without listening).
 * Kept separate from server.ts so tests can import the app directly.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerConfig,
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  // Security & infra plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    redis,
  });

  // OpenAPI docs
  await app.register(swagger, {
    openapi: {
      info: { title: 'NextGen AI Commerce API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  // Expose the interactive docs only outside production to avoid publishing the
  // full API surface to the internet.
  if (!isProd) {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  // Static serving for locally-stored media uploads (product images, etc.).
  mkdirSync(UPLOAD_ROOT, { recursive: true });
  await app.register(fastifyStatic, {
    root: UPLOAD_ROOT,
    prefix: '/uploads/',
    decorateReply: false,
    cacheControl: true,
    maxAge: '7d',
  });

  // Auth + error handling
  await app.register(authPlugin);
  await app.register(errorHandler);

  // Health checks
  app.get('/health', async () => ok({ status: 'ok', service: 'nextgen-commerce-api' }));
  app.get('/ready', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      return ok({ status: 'ready' });
    } catch (err) {
      return reply.status(503).send({ success: false, error: { code: 'NOT_READY', message: 'Dependencies unavailable' } });
    }
  });

  // Feature modules
  await app.register(async (api) => registerRoutes(api), { prefix: env.API_PREFIX });

  return app;
}
