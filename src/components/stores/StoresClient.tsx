"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui";
import { StoreForm } from "./StoreForm";

interface StoreRow {
  id: string;
  name: string;
  platform: string;
  storeType?: string;
  currency: string;
  feePercent: string | number;
  notes?: string | null;
  _count: { listings: number; orders: number };
}

const PLATFORM_BADGE: Record<string, string> = {
  ETSY: "bg-orange-50 text-orange-700 ring-orange-600/20",
  EBAY: "bg-blue-50 text-blue-700 ring-blue-600/20",
  SHOPIFY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OTHER: "bg-slate-100 text-slate-700 ring-slate-500/15",
};

export function StoresClient({ stores }: { stores: StoreRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each store operates in its own isolated environment with dedicated currency, fees, listings, and orders.
          </p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>+ Add store</Button>}
      </div>

      {adding && <StoreForm onDone={() => setAdding(false)} />}
      {editingStore && (
        <StoreForm
          storeId={editingStore.id}
          initial={{
            name: editingStore.name,
            platform: editingStore.platform,
            storeType: editingStore.storeType ?? "DROPSHIP",
            currency: editingStore.currency,
            feePercent: Number(editingStore.feePercent),
            notes: editingStore.notes ?? "",
          }}
          onDone={() => setEditingStore(null)}
        />
      )}

      {stores.length === 0 && !adding ? (
        <EmptyState
          title="No stores yet"
          desc="Create your first store environment to start adding listings and orders."
          action={<Button onClick={() => setAdding(true)}>+ Add store</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <Link key={s.id} href={`/stores/${s.id}`} className="group block">
              <Card className="relative overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md">
                <div className="h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-sky-400" />
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 transition group-hover:text-brand-600">
                        {s.name}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-400">
                        {s.currency} · {Number(s.feePercent)}% platform fee
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          s.storeType === "OWN_STOCK"
                            ? "bg-purple-50 text-purple-700 ring-purple-600/20"
                            : "bg-sky-50 text-sky-700 ring-sky-600/20"
                        }`}
                      >
                        {s.storeType === "OWN_STOCK" ? "Own Stock" : "Dropship"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          PLATFORM_BADGE[s.platform] || PLATFORM_BADGE.OTHER
                        }`}
                      >
                        {s.platform}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50/90 p-3 ring-1 ring-inset ring-slate-200/60">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Listings</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-800">{s._count.listings}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Orders</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-800">{s._count.orders}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs font-semibold text-brand-600">
                    <span>Open store workspace →</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingStore(s);
                      }}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      Edit store
                    </button>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
