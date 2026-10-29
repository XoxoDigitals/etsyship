export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function genOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ymd}-${rand}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_COLORS: Record<string, string> = {
  // listing
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/15",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-500/15",
  // order
  NEW: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SHIPPED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  REFUNDED: "bg-purple-50 text-purple-700 ring-purple-600/20",
  // shipment
  PENDING: "bg-slate-100 text-slate-600 ring-slate-500/15",
  INFO_RECEIVED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  IN_TRANSIT: "bg-blue-50 text-blue-700 ring-blue-600/20",
  OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  EXCEPTION: "bg-rose-50 text-rose-700 ring-rose-600/20",
  EXPIRED: "bg-slate-100 text-slate-600 ring-slate-500/15",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-500/15",
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  DRAFT: "bg-slate-400",
  ARCHIVED: "bg-slate-400",
  NEW: "bg-sky-500",
  PROCESSING: "bg-amber-500",
  SHIPPED: "bg-blue-500",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-rose-500",
  REFUNDED: "bg-purple-500",
  PENDING: "bg-slate-400",
  INFO_RECEIVED: "bg-sky-500",
  IN_TRANSIT: "bg-blue-500",
  OUT_FOR_DELIVERY: "bg-indigo-500",
  EXCEPTION: "bg-rose-500",
  EXPIRED: "bg-slate-400",
  UNKNOWN: "bg-slate-400",
};
