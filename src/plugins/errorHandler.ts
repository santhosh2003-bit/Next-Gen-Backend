import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../common/errors.js';
import { fail } from '../common/response.js';

/**
 * Central error handler — maps domain errors, Zod errors and Prisma errors
 * into the standard failure envelope.
 */
export default fp(async (app) => {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(fail('NOT_FOUND', `Route ${req.method} ${req.url} not found`));
  });

  app.setErrorHandler((error, req, reply) => {
    // Domain errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
    }

    // Zod validation
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(fail('BAD_REQUEST', 'Validation failed', error.flatten().fieldErrors));
    }

    // Fastify schema validation
    if ((error as { validation?: unknown }).validation) {
      return reply
        .status(400)
        .send(fail('BAD_REQUEST', error.message, (error as { validation?: unknown }).validation));
    }

    // Prisma known errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply
          .status(409)
          .send(fail('CONFLICT', 'A record with this value already exists', error.meta));
      }
      if (error.code === 'P2025') {
        return reply.status(404).send(fail('NOT_FOUND', 'Record not found'));
      }
      if (error.code === 'P2003') {
        return reply.status(409).send(fail('CONFLICT', 'Related record constraint failed'));
      }
    }

    // Rate limit
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send(fail('RATE_LIMITED', 'Too many requests, slow down'));
    }

    req.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Something went wrong'));
  });
});
