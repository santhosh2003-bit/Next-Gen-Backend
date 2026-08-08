import { buildApp } from './app.js';
import { env } from './config/env.js';
import { initRealtime } from './common/realtime.js';
import { prisma } from './common/prisma.js';
import { redis } from './common/redis.js';
import { ensureBootstrap } from './common/bootstrap.js';

async function main() {
  const app = await buildApp();

  // Ensure the admin account + core roles exist (idempotent) — no shell needed.
  await ensureBootstrap();

  await app.listen({ host: env.HOST, port: env.PORT });
  initRealtime(app);

  app.log.info(`🚀 API ready at http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
  app.log.info(`📚 Docs at http://${env.HOST}:${env.PORT}/docs`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal boot error:', err);
  process.exit(1);
});
