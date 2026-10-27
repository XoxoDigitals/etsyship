import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { ok, fail, handle } from "@/lib/api";
import { requireUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

// Accept common web image types; map to a safe extension.
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Save an uploaded image from the user's device to /public/uploads and return its URL.
export const POST = handle(async (req: Request) => {
  await requireUserId();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file provided", 400);

  const ext = ALLOWED[file.type];
  if (!ext) return fail("Only JPG, PNG, WEBP or GIF images are allowed", 400);
  if (file.size === 0) return fail("Empty file", 400);
  if (file.size > MAX_BYTES) return fail("Image must be 5 MB or smaller", 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), buf);

  return ok({ url: `/uploads/${name}` }, { status: 201 });
});
