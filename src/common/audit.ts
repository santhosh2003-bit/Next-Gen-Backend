import { prisma } from './prisma.js';

/**
 * Fire-and-forget audit trail writer. Never throws into the request path.
 */
export async function recordAudit(input: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: (input.metadata as object) ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch {
    // Auditing must never break the primary flow.
  }
}
