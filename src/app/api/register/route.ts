import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const POST = handle(async (req: Request) => {
  if (process.env.ALLOW_REGISTRATION === "false") {
    return fail("Registration is disabled", 403);
  }
  const body = await parseJson(req);
  const input = registerSchema.parse(body);
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("An account with this email already exists", 409);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email, name: input.name, passwordHash, settings: { create: {} } },
    select: { id: true, email: true, name: true },
  });

  await audit({ userId: user.id, action: "REGISTER", entity: "User", entityId: user.id });
  return ok({ id: user.id, email: user.email });
});
