import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { supplierAccountSchema } from "@/lib/validation";
import { encrypt, maskEmail } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// List supplier accounts for a store (never returns plaintext email — only masked).
export const GET = handle(async (req: Request) => {
  const userId = await requireUserId();
  const storeId = new URL(req.url).searchParams.get("storeId");
  if (!storeId) return fail("storeId is required", 400);
  await assertStoreOwner(storeId, userId);
  const accounts = await prisma.supplierAccount.findMany({
    where: { storeId, archived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, emailMasked: true, provider: true, createdAt: true },
  });
  return ok(accounts);
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const input = supplierAccountSchema.parse(await parseJson(req));
  await assertStoreOwner(input.storeId, userId);

  const account = await prisma.supplierAccount.create({
    data: {
      storeId: input.storeId,
      label: input.label,
      emailEnc: encrypt(input.email.toLowerCase().trim()),
      emailMasked: maskEmail(input.email.toLowerCase().trim()),
      provider: input.provider,
    },
    select: { id: true, label: true, emailMasked: true, provider: true, createdAt: true },
  });
  await audit({ userId, action: "CREATE", entity: "SupplierAccount", entityId: account.id });
  return ok(account, { status: 201 });
});
