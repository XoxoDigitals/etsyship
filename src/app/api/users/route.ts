import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { createUserSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUserId();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      stores: {
        where: { archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, platform: true, currency: true },
      },
      _count: {
        select: { stores: { where: { archived: false } } },
      },
    },
  });

  return ok(users);
});

export const POST = handle(async (req: Request) => {
  const actorId = await requireUserId();
  const body = await parseJson(req);
  const input = createUserSchema.parse(body);
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("A user with this email already exists", 409);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      passwordHash,
      settings: { create: {} },
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      stores: {
        where: { archived: false },
        select: { id: true, name: true, platform: true, currency: true },
      },
      _count: {
        select: { stores: { where: { archived: false } } },
      },
    },
  });

  await audit({
    userId: actorId,
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    meta: { email: user.email },
  });

  return ok(user, { status: 201 });
});

