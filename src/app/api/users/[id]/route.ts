import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { updateUserSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isSuperAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase().trim().startsWith("saboor@xoxo"));
}

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const actorId = await requireUserId();

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { id: true, email: true } }),
    prisma.user.findUnique({ where: { id } }),
  ]);
  if (!target) return fail("User not found", 404);

  const isSuperAdmin = isSuperAdminEmail(actor?.email);
  if (id !== actorId && !isSuperAdmin) {
    return fail("Only saboor@xoxodigitals.com can edit other users", 403);
  }

  const input = updateUserSchema.parse(await parseJson(req));
  const data: { email?: string; name?: string | null; passwordHash?: string } = {};

  if (input.email !== undefined) {
    const email = input.email.toLowerCase().trim();
    if (!isSuperAdmin && isSuperAdminEmail(email)) {
      return fail("Not authorized to assign super-admin email", 403);
    }
    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) return fail("Another user with this email already exists", 409);
      data.email = email;
    }
  }

  if (input.name !== undefined) {
    data.name = input.name?.trim() || null;
  }

  if (input.password && input.password.trim().length > 0) {
    data.passwordHash = await bcrypt.hash(input.password, 12);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
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
    action: "UPDATE",
    entity: "User",
    entityId: updated.id,
  });

  return ok(updated);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const actorId = await requireUserId();

  if (id === actorId) {
    return fail("You cannot delete your own active user account", 400);
  }

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { id: true, email: true } }),
    prisma.user.findUnique({ where: { id } }),
  ]);
  if (!target) return fail("User not found", 404);

  if (!isSuperAdminEmail(actor?.email)) {
    return fail("Only saboor@xoxodigitals.com can delete users", 403);
  }
  if (isSuperAdminEmail(target.email)) {
    return fail("The super-admin account cannot be deleted", 403);
  }

  await prisma.user.delete({ where: { id } });
  await audit({
    userId: actorId,
    action: "DELETE",
    entity: "User",
    entityId: id,
    meta: { email: target.email },
  });

  return ok({ id, deleted: true });
});

