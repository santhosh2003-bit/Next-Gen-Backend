import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../common/errors.js';
import type { AccessTokenPayload } from '../common/types.js';

/**
 * Registers JWT verification and exposes:
 *  - app.authenticate         : require a valid access token
 *  - app.requirePermissions() : require ALL given permission keys
 *  - app.requireRoles()       : require ANY of the given roles
 */
export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const payload = await request.jwtVerify<AccessTokenPayload>();
      request.authUser = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
      };
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  });

  // Populate authUser when a valid token is present, but never reject.
  app.decorate('optionalAuth', async (request: FastifyRequest) => {
    try {
      const payload = await request.jwtVerify<AccessTokenPayload>();
      request.authUser = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
      };
    } catch {
      // Anonymous request — leave authUser undefined.
    }
  });

  app.decorate('requirePermissions', (...perms: string[]) => {
    return async (request: FastifyRequest) => {
      if (!request.authUser) throw new UnauthorizedError();
      const has = perms.every(
        (p) => request.authUser!.permissions.includes(p) || request.authUser!.roles.includes('admin'),
      );
      if (!has) throw new ForbiddenError(`Missing permission(s): ${perms.join(', ')}`);
    };
  });

  app.decorate('requireRoles', (...roles: string[]) => {
    return async (request: FastifyRequest) => {
      if (!request.authUser) throw new UnauthorizedError();
      const has = roles.some((r) => request.authUser!.roles.includes(r));
      if (!has) throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
    };
  });
});
