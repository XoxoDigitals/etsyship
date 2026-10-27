"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui";
import { StoreForm } from "./StoreForm";

interface StoreRow {
  id: string;
  name: string;
  platform: string;
  currency: string;
  feePercent: string | number;
  _count: { listings: number; orders: number };
}

export function StoresClient({ stores }: { stores: StoreRow[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stores</h1>
          <p className="text-sm text-slate-500">Each store is its own environment (currency, fees, listings, orders).</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>+ Add store</Button>}
      </div>

      {adding && <StoreForm onDone={() => setAdding(false)} />}

      {stores.length === 0 && !adding ? (
        <EmptyState
          title="No stores yet"
          desc="Create your first store environment to start adding listings and orders."
          action={<Button onClick={() => setAdding(true)}>+ Add store</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <Link key={s.id} href={`/stores/${s.id}`}>
              <Card className="transition hover:shadow-md">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{s.name}</h3>
                    <Badge>{s.platform}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {s._count.listings} listings · {s._count.orders} orders
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {s.currency} · fee {Number(s.feePercent)}%
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
