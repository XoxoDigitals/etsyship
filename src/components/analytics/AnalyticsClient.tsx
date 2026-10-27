"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardBody, CardHeader, EmptyState, Stat } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { StoreAnalytics } from "@/lib/analytics";

const RANGES = [30, 90, 365] as const;

const C_REVENUE = "#2563eb";
const C_PROFIT = "#16a34a";
const C_ORDERS = "#64748b";

const STATUS_FILL: Record<string, string> = {
  NEW: "#94a3b8",
  PROCESSING: "#f59e0b",
  SHIPPED: "#3b82f6",
  DELIVERED: "#22c55e",
  CANCELLED: "#ef4444",
  REFUNDED: "#a855f7",
};

function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function compact(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function truncate(s: string, n = 22): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function AnalyticsClient({ storeId, currency }: { storeId: string; currency: "USD" | "GBP" | "EUR" | string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cur = currency as "USD" | "GBP" | "EUR";

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?storeId=${encodeURIComponent(storeId)}&days=${days}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Failed to load analytics");
        setData(json.data as StoreAnalytics);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message || "Failed to load analytics");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [storeId, days]);

  const moneyTip = (v: unknown) => formatMoney(v, cur);

  const statusData = data
    ? Object.entries(data.statusCounts)
        .filter(([, n]) => n > 0)
        .map(([name, value]) => ({ name, value }))
    : [];

  const hasOrders = !!data && (data.totals.orderCount > 0 || statusData.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Last {days} days</p>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                days === r ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      )}

      {data && (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Stat label="Revenue" value={formatMoney(data.totals.revenue, cur)} sub={`${data.totals.unitsSold} units`} />
            <Stat label="Cost" value={formatMoney(data.totals.cost, cur)} sub={`Fees ${formatMoney(data.totals.fees, cur)}`} />
            <Stat label="Profit" value={formatMoney(data.totals.profit, cur)} />
            <Stat label="Margin" value={`${(data.totals.margin * 100).toFixed(1)}%`} />
            <Stat label="Orders" value={data.totals.orderCount} sub="Excl. cancelled/refunded" />
            <Stat label="Avg order value" value={formatMoney(data.totals.avgOrderValue, cur)} />
          </div>

          {!hasOrders ? (
            <EmptyState
              title="No orders in this period"
              desc="Once orders are recorded, revenue and profit charts will show up here."
            />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-slate-900">Revenue &amp; profit</h2>
                </CardHeader>
                <CardBody>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C_REVENUE} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={C_REVENUE} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C_PROFIT} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={C_PROFIT} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#64748b" }} minTickGap={24} />
                        <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: "#64748b" }} width={44} />
                        <Tooltip formatter={(v) => moneyTip(v)} labelFormatter={(l) => String(l)} />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C_REVENUE} strokeWidth={2} fill="url(#gRev)" />
                        <Area type="monotone" dataKey="profit" name="Profit" stroke={C_PROFIT} strokeWidth={2} fill="url(#gProfit)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="text-base font-semibold text-slate-900">Orders per day</h2>
                  </CardHeader>
                  <CardBody>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#64748b" }} minTickGap={24} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} width={32} />
                          <Tooltip />
                          <Bar dataKey="orders" name="Orders" fill={C_ORDERS} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="text-base font-semibold text-slate-900">Orders by status</h2>
                  </CardHeader>
                  <CardBody>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                            {statusData.map((s) => (
                              <Cell key={s.name} fill={STATUS_FILL[s.name] ?? "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-slate-900">Top listings by profit</h2>
                </CardHeader>
                <CardBody>
                  {data.topListings.length === 0 ? (
                    <p className="text-sm text-slate-400">No listing sales in this period.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={data.topListings.map((l) => ({ ...l, label: truncate(l.title) }))}
                            layout="vertical"
                            margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                            <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12, fill: "#64748b" }} />
                            <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12, fill: "#475569" }} />
                            <Tooltip formatter={(v) => moneyTip(v)} />
                            <Bar dataKey="profit" name="Profit" fill={C_PROFIT} radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                              <th className="py-2 pr-3 font-medium">Listing</th>
                              <th className="py-2 pr-3 text-right font-medium">Units</th>
                              <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                              <th className="py-2 text-right font-medium">Profit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.topListings.map((l, i) => (
                              <tr key={`${l.title}-${i}`}>
                                <td className="max-w-[14rem] truncate py-2 pr-3 text-slate-700" title={l.title}>
                                  {l.title}
                                </td>
                                <td className="py-2 pr-3 text-right text-slate-600">{l.units}</td>
                                <td className="py-2 pr-3 text-right text-slate-600">{formatMoney(l.revenue, cur)}</td>
                                <td className="py-2 text-right font-medium text-slate-900">{formatMoney(l.profit, cur)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="In transit" value={data.shipments.inTransit} sub={`${data.shipments.undelivered} undelivered total`} />
            <Stat label="Delivered" value={data.shipments.delivered} />
            <Stat label="Exceptions" value={data.shipments.exceptions} sub={data.shipments.exceptions > 0 ? "Needs attention" : "All clear"} />
          </div>
        </div>
      )}
    </div>
  );
}
