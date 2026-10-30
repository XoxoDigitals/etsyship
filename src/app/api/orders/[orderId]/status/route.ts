import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { orderStatusUpdateSchema } from "@/lib/validation";
import { audit, orderEvent } from "@/lib/audit";
import { adjustInventoryForItems, isOrderStockActive } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = await params;
  const userId = await requireUserId();
  const { status } = orderStatusUpdateSchema.parse(await parseJson(req));
  const order = await assertOrderOwner(orderId, userId);

  if (order.status !== status) {
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { listingId: true, variantId: true, quantity: true },
    });
    const wasActive = isOrderStockActive(order.status);
    const nowActive = isOrderStockActive(status);
    if (wasActive && !nowActive) {
      await adjustInventoryForItems(items, 1);
    } else if (!wasActive && nowActive) {
      await adjustInventoryForItems(items, -1);
    }
  }

  const updated = await prisma.order.update({ where: { id: order.id }, data: { status } });
  await orderEvent(order.id, "STATUS_CHANGE", "Status → " + status, { from: order.status, to: status });
  await audit({ userId, action: "STATUS", entity: "Order", entityId: order.id, meta: { from: order.status, to: status } });

  return ok({ id: updated.id, status: updated.status });
});
