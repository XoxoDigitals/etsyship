import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const userId = await requireUserId();
  const setting = await prisma.setting.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return ok(setting.data);
});

export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await parseJson(req)) as Record<string, unknown>;
  const existing = await prisma.setting.findUnique({ where: { userId } });
  const merged = { ...((existing?.data as object) || {}), ...body };
  const setting = await prisma.setting.upsert({
    where: { userId },
    update: { data: merged as any },
    create: { userId, data: merged as any },
  });
  return ok(setting.data);
});
