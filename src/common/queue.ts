import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

/**
 * Named queues. Producers import these; the worker process (src/workers)
 * registers the matching processors.
 */
export const QUEUE_NAMES = {
  notifications: 'notifications',
  orders: 'orders',
  analytics: 'analytics',
} as const;

const connection = redisConnection;

export const notificationsQueue = new Queue(QUEUE_NAMES.notifications, { connection });
export const ordersQueue = new Queue(QUEUE_NAMES.orders, { connection });
export const analyticsQueue = new Queue(QUEUE_NAMES.analytics, { connection });

export interface NotificationJob {
  userId: string;
  channel: 'PUSH' | 'EMAIL' | 'SMS' | 'IN_APP';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface AnalyticsJob {
  event: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

export async function enqueueNotification(job: NotificationJob) {
  await notificationsQueue.add('send', job, {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function enqueueAnalytics(job: AnalyticsJob) {
  await analyticsQueue.add('track', job, { removeOnComplete: 5000, removeOnFail: 1000 });
}
