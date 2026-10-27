import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { orderStatusUpdateSchema } from "@/lib/validation";
import { audit, orderEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, { params }: { params: { orderId: string } }) => {
  const userId = await requireUserId();
  const { status } = orderStatusUpdateSchema.parse(await parseJson(req));
  const order = await assertOrderOwner(params.orderId, userId);

  const updated = await prisma.order.update({ where: { id: order.id }, data: { status } });
  await orderEvent(order.id, "STATUS_CHANGE", "Status → " + status, { from: order.status, to: status });
  await audit({ userId, action: "STATUS", entity: "Order", entityId: order.id, meta: { from: order.status, to: status } });

  return ok({ id: updated.id, status: updated.status });
});
