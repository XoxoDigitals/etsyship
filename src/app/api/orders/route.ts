import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { orderSchema, orderStatusEnum } from "@/lib/validation";
import { audit, orderEvent } from "@/lib/audit";
import { genOrderNumber } from "@/lib/utils";
import { money } from "@/lib/money";
import { adjustInventoryForItems } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  if (!storeId) return fail("storeId is required", 400);
  await assertStoreOwner(storeId, userId);

  const statusParam = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));

  const where: Prisma.OrderWhereInput = { storeId, archived: false };
  if (statusParam) {
    const parsed = orderStatusEnum.safeParse(statusParam);
    if (!parsed.success) return fail("Invalid status", 400);
    where.status = parsed.data;
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: true,
        shipments: { select: { kind: true, status: true, delivered: true } },
        _count: { select: { shipments: true } },
      },
    }),
  ]);

  const items = rows.map((o) => {
    const lineItems = o.items.map((i) => ({
      id: i.id,
      title: i.title,
      variantName: i.variantName,
      quantity: i.quantity,
      sellingPrice: money(i.sellingPrice),
    }));
    const revenue = money(lineItems.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0));
    return {
      id: o.id,
      storeId: o.storeId,
      orderNumber: o.orderNumber,
      status: o.status,
      currency: o.currency,
      customerName: o.customerName,
      placedAt: o.placedAt.toISOString(),
      createdAt: o.createdAt.toISOString(),
      items: lineItems,
      shipments: o.shipments,
      _count: o._count,
      revenue,
    };
  });

  return ok({ items, total, page, pageSize });
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const body = orderSchema.parse(await parseJson(req));
  const store = await assertStoreOwner(body.storeId, userId);

  // Make sure referenced listings/variants belong to this store (tenancy).
  const listingIds = Array.from(new Set(body.items.map((i) => i.listingId).filter((v): v is string => !!v)));
  if (listingIds.length) {
    const count = await prisma.listing.count({ where: { id: { in: listingIds }, storeId: store.id } });
    if (count !== listingIds.length) return fail("One or more listings do not belong to this store", 400);
  }
  const variantIds = Array.from(new Set(body.items.map((i) => i.variantId).filter((v): v is string => !!v)));
  if (variantIds.length) {
    const count = await prisma.listingVariant.count({
      where: { id: { in: variantIds }, listing: { storeId: store.id } },
    });
    if (count !== variantIds.length) return fail("One or more variants do not belong to this store", 400);
  }

  // Orders are always denominated in the store currency so cross-order analytics totals
  // (revenue/cost/profit) stay in a single currency and remain summable.
  if (body.currency && body.currency !== store.currency) {
    return fail(`Order currency must match the store currency (${store.currency})`, 400);
  }
  const currency = store.currency;

  const supplied = body.orderNumber?.trim();
  let orderNumber = supplied || genOrderNumber();

  if (supplied) {
    const clash = await prisma.order.findUnique({
      where: { storeId_orderNumber: { storeId: store.id, orderNumber } },
      select: { id: true },
    });
    if (clash) return fail(`Order number "${orderNumber}" already exists in this store`, 409);
  } else {
    let unique = false;
    for (let i = 0; i < 8; i++) {
      const clash = await prisma.order.findUnique({
        where: { storeId_orderNumber: { storeId: store.id, orderNumber } },
        select: { id: true },
      });
      if (!clash) {
        unique = true;
        break;
      }
      orderNumber = genOrderNumber();
    }
    if (!unique) return fail("Could not generate a unique order number, please retry", 409);
  }

  const order = await prisma.order.create({
    data: {
      storeId: store.id,
      orderNumber,
      currency,
      customerName: body.customerName,
      customerEmail: body.customerEmail || null,
      customerPhone: body.customerPhone || null,
      shippingAddress: body.shippingAddress || null,
      shippingCity: body.shippingCity || null,
      shippingState: body.shippingState || null,
      shippingZip: body.shippingZip || null,
      shippingCountry: body.shippingCountry || null,
      notes: body.notes || null,
      items: {
        create: body.items.map((i) => ({
          listingId: i.listingId || null,
          variantId: i.variantId || null,
          title: i.title,
          variantName: i.variantName || null,
          quantity: i.quantity,
          sellingPrice: i.sellingPrice,
        })),
      },
    },
    include: { items: true },
  });

  await adjustInventoryForItems(body.items, -1);
  await orderEvent(order.id, "CREATED", "Order created");
  await audit({ userId, action: "CREATE", entity: "Order", entityId: order.id, meta: { orderNumber } });

  return ok(
    {
      ...order,
      placedAt: order.placedAt.toISOString(),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((i) => ({ ...i, sellingPrice: money(i.sellingPrice) })),
    },
    { status: 201 }
  );
});
