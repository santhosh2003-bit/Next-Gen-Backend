import argon2 from "argon2";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../common/prisma.js";
import { env } from "../../config/env.js";
import { ConflictError, UnauthorizedError } from "../../common/errors.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";

/** Hash a refresh token before persisting — never store raw tokens. */
function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function loadUserGrants(userId: string) {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  const roleNames = roles.map((r) => r.role.name);
  const permissions = [
    ...new Set(
      roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)),
    ),
  ];
  return { roleNames, permissions };
}

export class AuthService {
  constructor(private app: FastifyInstance) {}

  private async issueTokens(
    user: { id: string; email: string },
    grants: { roleNames: string[]; permissions: string[] },
    ctx: { userAgent?: string; ip?: string },
  ) {
    const accessToken = this.app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: grants.roleNames,
        permissions: grants.permissions,
      },
      { expiresIn: env.JWT_ACCESS_TTL },
    );

    // Create a session row and a refresh token bound to it.
    const rawRefresh = crypto.randomBytes(48).toString("hex");
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(rawRefresh),
        userAgent: ctx.userAgent,
        ipAddress: ctx.ip,
        expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL * 1000),
      },
    });

    // The refresh token clients send back is `<sessionId>.<raw>`.
    const refreshToken = `${session.id}.${rawRefresh}`;
    return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
  }

  async register(
    input: RegisterInput,
    ctx: { userAgent?: string; ip?: string },
  ) {
    // Reserved admin accounts can never be created through self-service signup.
    const reserved = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (reserved.includes(input.email.trim().toLowerCase())) {
      throw new ConflictError("Email is already registered");
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) throw new ConflictError("Email is already registered");

    // Registration only ever grants the customer role — no privilege escalation.

    const passwordHash = await argon2.hash(input.password);

    // First real user OR anyone gets the default "customer" role.
    const customerRole = await prisma.role.findUnique({
      where: { name: "customer" },
    });

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roles: customerRole
          ? { create: { roleId: customerRole.id } }
          : undefined,
      },
    });

    const grants = await loadUserGrants(user.id);
    const tokens = await this.issueTokens(user, grants, ctx);
    return { user: this.publicUserWithGrants(user, grants), ...tokens };
  }

  async login(input: LoginInput, ctx: { userAgent?: string; ip?: string }) {
    // The identifier may be an email or a phone number.
    const identifier = input.email.trim();
    const isEmail = identifier.includes("@");
    const user = await prisma.user.findFirst({
      where: isEmail
        ? { email: identifier.toLowerCase() }
        : { phone: identifier },
    });
    if (!user || user.status === "DELETED")
      throw new UnauthorizedError("Invalid credentials");

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedError("Invalid credentials");
    if (user.status === "SUSPENDED")
      throw new UnauthorizedError("Account suspended");

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const grants = await loadUserGrants(user.id);
    const tokens = await this.issueTokens(user, grants, ctx);
    return { user: this.publicUserWithGrants(user, grants), ...tokens };
  }

  async refresh(
    refreshToken: string,
    ctx: { userAgent?: string; ip?: string },
  ) {
    const [sessionId, raw] = refreshToken.split(".");
    if (!sessionId || !raw)
      throw new UnauthorizedError("Malformed refresh token");

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== hashToken(raw)
    ) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Rotate: revoke old session, issue a new one.
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const grants = await loadUserGrants(session.userId);
    const tokens = await this.issueTokens(session.user, grants, ctx);
    return { user: this.publicUserWithGrants(session.user, grants), ...tokens };
  }

  async logout(refreshToken?: string, userId?: string) {
    if (refreshToken) {
      const [sessionId] = refreshToken.split(".");
      if (sessionId) {
        await prisma.userSession.updateMany({
          where: { id: sessionId, userId },
          data: { revokedAt: new Date() },
        });
      }
    } else if (userId) {
      // Revoke all sessions.
      await prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedError();
    const grants = await loadUserGrants(userId);
    return {
      ...this.publicUser(user),
      roles: grants.roleNames,
      permissions: grants.permissions,
    };
  }

  private publicUser(u: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    status: string;
    emailVerified: boolean;
  }) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      status: u.status,
      emailVerified: u.emailVerified,
    };
  }

  private publicUserWithGrants(
    u: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      status: string;
      emailVerified: boolean;
    },
    grants: { roleNames: string[]; permissions: string[] },
  ) {
    return {
      ...this.publicUser(u),
      roles: grants.roleNames,
      permissions: grants.permissions,
    };
  }
}
