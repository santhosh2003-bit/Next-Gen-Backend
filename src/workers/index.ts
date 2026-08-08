import { Worker } from 'bullmq';
import { redisConnection } from '../common/redis.js';
import { QUEUE_NAMES, type AnalyticsJob, type NotificationJob } from '../common/queue.js';
import { prisma } from '../common/prisma.js';
import { emitToUser } from '../common/realtime.js';

/**
 * Standalone worker process. Run with `npm run worker`.
 * Processes notification and analytics jobs off the shared Redis queues.
 */
const connection = redisConnection;

const notificationWorker = new Worker<NotificationJob>(
  QUEUE_NAMES.notifications,
  async (job) => {
    const { userId, channel, title, body, data } = job.data;

    // Persist an in-app notification record.
    await prisma.notification.create({
      data: { userId, channel, status: 'SENT', title, body, data: (data as object) ?? undefined },
    });

    // Push realtime event (if the user has an open socket).
    emitToUser(userId, 'notification', { title, body, data });

    // For PUSH/EMAIL/SMS: look up tokens and dispatch to the provider here.
    if (channel === 'PUSH') {
      const tokens = await prisma.pushToken.findMany({ where: { userId } });
      // TODO: integrate Expo push / FCM. Tokens available in `tokens`.
      job.log?.(`Would push to ${tokens.length} device(s)`);
    }

    return { delivered: true };
  },
  { connection, concurrency: 10 },
);

const analyticsWorker = new Worker<AnalyticsJob>(
  QUEUE_NAMES.analytics,
  async (job) => {
    const { event, userId, properties } = job.data;
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action: `analytics.${event}`,
        entity: 'analytics',
        metadata: (properties as object) ?? undefined,
      },
    });
    return { tracked: true };
  },
  { connection, concurrency: 5 },
);

for (const w of [notificationWorker, analyticsWorker]) {
  w.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });
}

// eslint-disable-next-line no-console
console.log('👷 Workers started: notifications, analytics');

const shutdown = async () => {
  await Promise.all([notificationWorker.close(), analyticsWorker.close()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
