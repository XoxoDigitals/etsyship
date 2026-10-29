"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardBody, Field, Input } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Registration failed");
      return;
    }
    // auto sign-in
    await signIn("credentials", { email, password, redirect: false });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100/60 via-slate-50 to-slate-100" />
      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 text-xl font-bold text-white shadow-lg shadow-brand-600/25 ring-1 ring-inset ring-white/20">
            D
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Start managing your stores and orders</p>
        </div>
        <Card className="shadow-xl shadow-slate-900/[0.04]">
          <CardBody className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Full name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" />
              </Field>
              <Field label="Email address">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>
              <Field label="Password" hint="Minimum 8 characters">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </Field>
              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading} className="w-full py-2.5">
                {loading ? "Creating…" : "Create account"}
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
