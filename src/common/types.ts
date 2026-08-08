import 'fastify';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string; // session id
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest) => Promise<void>;
    optionalAuth: (request: import('fastify').FastifyRequest) => Promise<void>;
    requirePermissions: (
      ...perms: string[]
    ) => (request: import('fastify').FastifyRequest) => Promise<void>;
    requireRoles: (
      ...roles: string[]
    ) => (request: import('fastify').FastifyRequest) => Promise<void>;
  }
}
