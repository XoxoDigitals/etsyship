import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { listingSchema, listingStatusEnum } from "@/lib/validation";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined ? null : money(v));

export const GET = handle(async (req: Request) => {
  const userId = await requireUserId();
  const sp = new URL(req.url).searchParams;
  const storeId = sp.get("storeId");
  if (!storeId) return fail("storeId required", 400);
  await assertStoreOwner(storeId, userId);

  const q = sp.get("q")?.trim();
  const statusParsed = listingStatusEnum.safeParse(sp.get("status"));
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20));

  const where: Prisma.ListingWhereInput = {
    storeId,
    archived: false,
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(statusParsed.success ? { status: statusParsed.data } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { select: { id: true, stockQuantity: true } },
        _count: { select: { variants: true } },
      },
    }),
  ]);

  const items = rows.map((l) => {
    const variantStockValues = l.variants
      .map((v) => v.stockQuantity)
      .filter((q): q is number => typeof q === "number");
    const effectiveStock =
      variantStockValues.length > 0
        ? variantStockValues.reduce((a, b) => a + b, 0)
        : l.stockQuantity;
    return {
      ...l,
      stockQuantity: l.stockQuantity,
      effectiveStock,
      supplierPrice: num(l.supplierPrice),
      listedPrice: num(l.listedPrice),
    };
  });

  return ok({ items, total, page, pageSize });
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const body = await parseJson<Record<string, unknown>>(req);
  const input = listingSchema.parse(body);
  await assertStoreOwner(input.storeId, userId);

  const fs = body?.fetchStatus;
  const fetchStatus = fs === "OK" || fs === "PARTIAL" || fs === "FAILED" ? fs : "FAILED";

  // Sourcing options: use the supplied list, else seed one from the legacy single-supplier fields.
  const supplierInputs = input.suppliers.length
    ? input.suppliers
    : [
        {
          name: input.supplierName?.trim() || "AliExpress",
          url: input.supplierUrl || null,
          unitPrice: input.supplierPrice ?? null,
          currency: input.supplierCurrency,
          shipDaysUS: null,
          shipDaysUK: null,
          notes: null,
          isDefault: true,
        },
      ];
  let defaultIdx = supplierInputs.findIndex((s) => s.isDefault);
  if (defaultIdx < 0) defaultIdx = 0;
  const def = supplierInputs[defaultIdx];

  const created = await prisma.listing.create({
    data: {
      storeId: input.storeId,
      title: input.title,
      description: input.description || null,
      // Legacy single-supplier columns mirror the default sourcing option.
      supplierUrl: (def.url as string | null)?.trim?.() || null,
      supplierName: def.name?.trim() || "AliExpress",
      supplierPrice: def.unitPrice ?? null,
      supplierCurrency: def.currency,
      listedPrice: input.listedPrice ?? null,
      stockQuantity: input.stockQuantity ?? null,
      status: input.status,
      fetchStatus,
      suppliers: {
        create: supplierInputs.map((s, i) => ({
          name: s.name?.trim() || "AliExpress",
          url: (s.url as string | null)?.trim?.() || null,
          unitPrice: s.unitPrice ?? null,
          currency: s.currency,
          shipDaysUS: s.shipDaysUS ?? null,
          shipDaysUK: s.shipDaysUK ?? null,
          notes: s.notes?.trim() || null,
          isDefault: i === defaultIdx,
          position: i,
        })),
      },
      images: {
        create: input.images.map((url, i) => ({ url, position: i, isPrimary: i === 0 })),
      },
      variants: {
        create: input.variants.map((v, i) => ({
          name: v.name,
          sku: v.sku || null,
          imageUrl: v.imageUrl || null,
          supplierPrice: v.supplierPrice ?? null,
          listedPrice: v.listedPrice ?? null,
          stockQuantity: v.stockQuantity ?? null,
          position: i,
        })),
      },
    },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
    },
  });

  return ok(
    {
      ...created,
      supplierPrice: num(created.supplierPrice),
      listedPrice: num(created.listedPrice),
      variants: created.variants.map((v) => ({
        ...v,
        supplierPrice: num(v.supplierPrice),
        listedPrice: num(v.listedPrice),
      })),
    },
    { status: 201 }
  );
});
