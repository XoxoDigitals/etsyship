"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  customerName: string;
  placedAt: string;
  items: { id: string; title: string; variantName: string | null; quantity: number; sellingPrice: number }[];
  shipments: { kind: string; status: string; delivered: boolean }[];
  _count: { shipments: number };
  revenue: number;
}

export interface OrdersInitial {
  items: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUSES = ["NEW", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

function itemsSummary(items: OrderRow["items"]): string {
  if (!items.length) return "—";
  const first = items[0];
  const qty = items.reduce((s, i) => s + i.quantity, 0);
  const label = first.variantName ? `${first.title} (${first.variantName})` : first.title;
  const more = items.length > 1 ? ` +${items.length - 1} more` : "";
  return `${qty > 1 ? `${qty}× ` : ""}${label}${more}`;
}

function shipmentStatusByKind(o: OrderRow, kind: "SUPPLIER" | "CUSTOMER") {
  const pool = o.shipments.filter((s) => s.kind === kind);
  if (!pool.length) return <span className="text-xs text-slate-400">No tracking</span>;

  const priority = [
    "DELIVERED",
    "OUT_FOR_DELIVERY",
    "IN_TRANSIT",
    "INFO_RECEIVED",
    "EXCEPTION",
    "PENDING",
    "EXPIRED",
    "UNKNOWN",
  ];

  if (pool.some((s) => s.delivered)) {
    return <Badge status="DELIVERED" />;
  }

  for (const st of priority) {
    if (pool.some((s) => s.status === st)) {
      return <Badge status={st} />;
    }
  }

  return <Badge status={pool[0].status || "PENDING"} />;
}

export function OrdersClient({
  storeId,
  storeCurrency,
  initial,
}: {
  storeId: string;
  storeCurrency: string;
  initial: OrdersInitial;
}) {
  const [data, setData] = useState<OrdersInitial>(initial);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  // Debounce search text.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, debouncedQ]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ storeId, page: String(page), pageSize: String(initial.pageSize) });
      if (status) params.set("status", status);
      if (debouncedQ) params.set("q", debouncedQ);
      try {
        const res = await fetch(`/api/orders?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load orders");
        setData(json.data as OrdersInitial);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [storeId, status, debouncedQ, page, initial.pageSize]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order number or customer…"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data.items.length === 0 && !loading ? (
        <EmptyState
          title="No orders found"
          desc={status || debouncedQ ? "Try changing the filters." : "Create your first order to start tracking."}
          action={
            <Link href={`/stores/${storeId}/orders/new`}>
              <Button>+ Create order</Button>
            </Link>
          }
        />
      ) : (
        <Card className={loading ? "opacity-60" : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Items</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                  <th className="px-6 py-3">Supplier Tracking</th>
                  <th className="px-6 py-3">Buyer Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((o) => (
                  <tr key={o.id} className="transition hover:bg-slate-50/80">
                    <td className="px-6 py-3.5 font-semibold">
                      <Link href={`/stores/${storeId}/orders/${o.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-800">{o.customerName}</td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-slate-500">{fmtDate(o.placedAt)}</td>
                    <td className="px-6 py-3.5">
                      <Badge status={o.status} />
                    </td>
                    <td className="max-w-xs truncate px-6 py-3.5 text-slate-600" title={itemsSummary(o.items)}>
                      {itemsSummary(o.items)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                      {formatMoney(o.revenue, (o.currency || storeCurrency) as "USD" | "GBP" | "EUR")}
                    </td>
                    <td className="px-6 py-3.5">{shipmentStatusByKind(o, "SUPPLIER")}</td>
                    <td className="px-6 py-3.5">{shipmentStatusByKind(o, "CUSTOMER")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-6 py-3 text-xs font-medium text-slate-500">
            <span>
              {data.total} order{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
