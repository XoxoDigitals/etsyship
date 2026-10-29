"use client";
import React from "react";
import { cn, STATUS_COLORS, STATUS_DOT_COLORS } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...p }: DivProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(15,23,42,0.03),0_1px_2px_-1px_rgba(15,23,42,0.03)]",
        className
      )}
      {...p}
    />
  );
}
export function CardBody({ className, ...p }: DivProps) {
  return <div className={cn("p-6", className)} {...p} />;
}
export function CardHeader({ className, ...p }: DivProps) {
  return <div className={cn("border-b border-slate-100/90 px-6 py-4", className)} {...p} />;
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
    primary:
      "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-brand-600 hover:to-brand-700 active:from-brand-700 active:to-brand-700 disabled:from-brand-300 disabled:to-brand-300 disabled:shadow-none",
    secondary:
      "bg-white text-slate-700 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 active:bg-slate-100",
    danger:
      "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-rose-600 hover:to-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-60",
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
        "w-full rounded-lg border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-slate-50 disabled:text-slate-400",
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
        "w-full rounded-lg border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15",
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
        "w-full rounded-lg border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15",
        className
      )}
      {...p}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-semibold tracking-wide text-slate-700", className)} {...p} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const color = status
    ? STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700 ring-slate-500/15"
    : "bg-slate-100 text-slate-700 ring-slate-500/15";
  const dot = status ? STATUS_DOT_COLORS[status] : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        color
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {children ?? (status ? status.replace(/_/g, " ") : undefined)}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-md hover:shadow-slate-900/[0.04]">
      <div className=" inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/70 via-indigo-500/60 to-transparent" />
      <CardBody className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-slate-900">{value}</p>
        {sub && <p className="mt-1.5 text-xs font-medium text-slate-500">{sub}</p>}
      </CardBody>
    </Card>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/90 bg-white/80 px-6 py-16 text-center shadow-sm">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/70">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-sm text-slate-500">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
