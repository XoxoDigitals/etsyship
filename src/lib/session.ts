import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./db";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ?? null;
}

/** Throws a 401-style error if not signed in. Returns the user id. */
export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) {
    const err = new Error("UNAUTHORIZED") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return id;
}

/**
 * Ensure the given store belongs to the current user. Returns the store or throws 403/404.
 * Every store-scoped query MUST go through this so tenants can't read each other's data.
 */
export async function assertStoreOwner(storeId: string, userId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (store.userId !== userId) {
    const err = new Error("FORBIDDEN") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return store;
}

/** Resolve a store id from an order id, asserting ownership. */
export async function assertOrderOwner(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
  if (!order) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (order.store.userId !== userId) {
    const err = new Error("FORBIDDEN") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return order;
}
