import { env } from '../config/env.js';

export const loggerConfig =
  env.NODE_ENV === 'development'
    ? {
        level: env.LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : { level: env.LOG_LEVEL };
