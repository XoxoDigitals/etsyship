import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Wrap a route handler so thrown errors become clean JSON responses.
 * Recognises our auth helpers' { status } errors and Zod validation errors.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail("Validation failed", 422, { issues: err.flatten() });
      }
      const e = err as Error & { status?: number };
      if (e?.status === 401) return fail("Unauthorized", 401);
      if (e?.status === 403) return fail("Forbidden", 403);
      if (e?.status === 404) return fail("Not found", 404);
      console.error("API error:", err);
      return fail("Internal server error", 500);
    }
  };
}

export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    const err = new Error("Invalid JSON body") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
}
