import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Prevent path traversal: allow only safe UUID/alphanumeric filenames with allowed extensions
  const safeName = path.basename(filename);
  if (!safeName || safeName !== filename || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType = MIME_MAP[ext];
  if (!contentType) {
    return new NextResponse("Unsupported file type", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", safeName);
  try {
    const buf = await readFile(filePath);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

