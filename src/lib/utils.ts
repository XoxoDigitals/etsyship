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
  ACTIVE: "bg-green-100 text-green-800",
  DRAFT: "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-gray-200 text-gray-600",
  // order
  NEW: "bg-slate-100 text-slate-700",
  PROCESSING: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-purple-100 text-purple-800",
  // shipment
  PENDING: "bg-slate-100 text-slate-600",
  INFO_RECEIVED: "bg-slate-100 text-slate-700",
  IN_TRANSIT: "bg-blue-100 text-blue-800",
  OUT_FOR_DELIVERY: "bg-indigo-100 text-indigo-800",
  EXCEPTION: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-200 text-gray-700",
  UNKNOWN: "bg-slate-100 text-slate-500",
};
