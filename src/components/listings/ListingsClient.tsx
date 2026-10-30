"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type Cur = "USD" | "GBP" | "EUR";

export type ListingRow = {
  id: string;
  title: string;
  status: string;
  supplierCurrency: Cur;
  supplierPrice: number | null;
  listedPrice: number | null;
  stockQuantity?: number | null;
  effectiveStock?: number | null;
  images: { id: string; url: string; isPrimary: boolean }[];
  _count: { variants: number };
};

type ListData = { items: ListingRow[]; total: number; page: number; pageSize: number };

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  DRAFT: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/15",
};

export function ListingsClient({
  storeId,
  storeCurrency,
  initial,
}: {
  storeId: string;
  storeCurrency: Cur;
  initial: ListData;
}) {
  const router = useRouter();
  const [data, setData] = useState<ListData>(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ storeId, page: String(page), pageSize: String(initial.pageSize) });
        if (q.trim()) params.set("q", q.trim());
        if (status) params.set("status", status);
        const res = await fetch(`/api/listings?${params.toString()}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load listings");
        setData(json.data as ListData);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, status, page, refreshKey, storeId, initial.pageSize]);

  async function deleteListing(id: string, title: string) {
    if (!window.confirm(`Delete product "${title}"?`)) return;
    setError(null);
    const res = await fetch(`/api/listings/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to delete listing");
      return;
    }
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function margin(l: ListingRow): string {
    if (l.listedPrice === null || l.supplierPrice === null || l.listedPrice <= 0) return "—";
    const pct = ((l.listedPrice - l.supplierPrice) / l.listedPrice) * 100;
    const approx = l.supplierCurrency !== storeCurrency ? "~" : "";
    return `${approx}${pct.toFixed(1)}%`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search listings by title…"
          className="sm:max-w-sm"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data.items.length === 0 ? (
        <EmptyState
          title={loading ? "Loading…" : "No listings yet"}
          desc={loading ? undefined : "Add your first listing manually or by fetching it from an AliExpress URL."}
          action={
            !loading && (
              <Link
                href={`/stores/${storeId}/listings/new`}
                className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                + Add listing
              </Link>
            )
          }
        />
      ) : (
        <Card className={loading ? "opacity-70" : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Listing</th>
                  <th className="px-6 py-3">Supplier price</th>
                  <th className="px-6 py-3">Listed price</th>
                  <th className="px-6 py-3">Margin</th>
                  <th className="px-6 py-3">Stock</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Variants</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((l) => {
                  const primary = l.images.find((i) => i.isPrimary) ?? l.images[0];
                  const href = `/stores/${storeId}/listings/${l.id}/edit`;
                  const stockVal = l.effectiveStock !== undefined ? l.effectiveStock : l.stockQuantity;
                  return (
                    <tr key={l.id} className="transition hover:bg-slate-50/80">
                      <td className="px-6 py-3.5">
                        <Link href={href} className="group flex items-center gap-3.5">
                          {primary ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={primary.url}
                              alt=""
                              className="h-11 w-11 rounded-lg border border-slate-200/80 object-cover shadow-sm"
                              referrerPolicy={primary.url.startsWith("http") ? "no-referrer" : undefined}
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[11px] text-slate-400">
                              none
                            </div>
                          )}
                          <span className="line-clamp-2 max-w-xs font-semibold text-slate-800 transition group-hover:text-brand-600">
                            {l.title}
                          </span>
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 tabular-nums text-slate-600">
                        {l.supplierPrice === null ? "—" : formatMoney(l.supplierPrice, l.supplierCurrency)}
                      </td>
                      <td className="px-6 py-3.5 font-medium tabular-nums text-slate-900">
                        {l.listedPrice === null ? "—" : formatMoney(l.listedPrice, storeCurrency)}
                      </td>
                      <td className="px-6 py-3.5 font-medium tabular-nums text-emerald-700">{margin(l)}</td>
                      <td className="px-6 py-3.5 tabular-nums">
                        {stockVal === null || stockVal === undefined ? (
                          <span className="text-slate-400">—</span>
                        ) : stockVal <= 0 ? (
                          <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            Out of stock (0)
                          </span>
                        ) : stockVal <= 5 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Low ({stockVal})
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-800">{stockVal} in stock</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge status={l.status} />
                      </td>
                      <td className="px-6 py-3.5 text-slate-700">
                        {l._count.variants > 0 ? <Badge>{l._count.variants}</Badge> : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            href={href}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            Edit
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => deleteListing(l.id, l.title)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {data.page} of {totalPages} · {data.total} listings
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
      )}
    </div>
  );
}
