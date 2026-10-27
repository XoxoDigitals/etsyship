import { prisma } from "./db";

export async function audit(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        meta: (params.meta as any) ?? undefined,
        ip: params.ip ?? null,
      },
    });
  } catch {
    // Audit must never break the main flow.
  }
}

/** Append an entry to an order's timeline. */
export async function orderEvent(orderId: string, type: string, message: string, meta?: Record<string, unknown>) {
  try {
    await prisma.orderEvent.create({
      data: { orderId, type, message, meta: (meta as any) ?? undefined },
    });
  } catch {
    // non-fatal
  }
}
