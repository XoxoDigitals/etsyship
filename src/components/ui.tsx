"use client";
import React from "react";
import { cn, STATUS_COLORS } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...p }: DivProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]",
        className
      )}
      {...p}
    />
  );
}
export function CardBody({ className, ...p }: DivProps) {
  return <div className={cn("p-5", className)} {...p} />;
}
export function CardHeader({ className, ...p }: DivProps) {
  return <div className={cn("border-b border-slate-100 px-5 py-4", className)} {...p} />;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400",
    danger: "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  const sizes: Record<string, string> = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className
      )}
      {...p}
    />
  );
}

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...p}
    />
  );
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...p}
    />
  );
}

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...p}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-slate-700", className)} {...p} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const color = status ? STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/[0.04]",
        color
      )}
    >
      {children ?? status}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="transition hover:shadow-md hover:shadow-slate-900/[0.05]">
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </CardBody>
    </Card>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <p className="text-base font-medium text-slate-700">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-sm text-slate-400">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
