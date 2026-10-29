"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { formatMoney, CURRENCY_SYMBOLS } from "@/lib/money";
import type { RankedSupplier } from "@/lib/suppliers";

type Cur = "USD" | "GBP" | "EUR";

export interface SupplierGroup {
  listingId: string;
  listingTitle: string;
  suppliers: RankedSupplier[];
}

export interface TrackingEventData {
  id: string;
  time: string;
  status: string;
  location: string | null;
  description: string;
}

export interface ShipmentData {
  id: string;
  orderId: string;
  kind: "SUPPLIER" | "CUSTOMER";
  trackingNumber: string;
  carrierCode: string | null;
  carrierName: string | null;
  status: string;
  statusDetail: string | null;
  estimatedDelivery: string | null;
  delivered: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  deepLink: string;
  events: TrackingEventData[];
}

export interface PurchaseData {
  id: string;
  supplierAccountId: string | null;
  supplierAccount: { label: string; emailMasked: string } | null;
  supplierOrderNo: string | null;
  buyingPrice: number;
  buyingCurrency: Cur;
  buyingPriceInOrderCurrency: number | null;
  fxRateUsed: number | null;
  cainiaoTrackingNo: string | null;
  purchasedAt: string;
}

export interface OrderEventData {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface OrderDetailData {
  id: string;
  storeId: string;
  orderNumber: string;
  status: string;
  currency: Cur;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  notes: string | null;
  placedAt: string;
  items: {
    id: string;
    listingId: string | null;
    variantId: string | null;
    title: string;
    variantName: string | null;
    quantity: number;
    sellingPrice: number;
  }[];
  purchases: PurchaseData[];
  shipments: ShipmentData[];
  events: OrderEventData[];
}

export interface SupplierAccountOption {
  id: string;
  label: string;
  emailMasked: string;
}

const STATUSES = ["NEW", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data as T;
}

export function OrderDetail({
  order: initialOrder,
  storeCurrency,
  supplierAccounts,
  supplierGroups = [],
}: {
  order: OrderDetailData;
  storeCurrency: string;
  supplierAccounts: SupplierAccountOption[];
  supplierGroups?: SupplierGroup[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetailData>(initialOrder);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cur = (order.currency || storeCurrency) as Cur;

  async function reload() {
    try {
      const fresh = await api<OrderDetailData>(`/api/orders/${order.id}`);
      setOrder(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh order");
    }
    router.refresh();
  }

  async function changeStatus(status: string) {
    setStatusBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  const total = order.items.reduce((s, i) => s + i.sellingPrice * i.quantity, 0);
  const costInOrderCur = order.purchases.reduce((s, p) => s + (p.buyingPriceInOrderCurrency ?? 0), 0);
  const addressLines = [
    order.shippingAddress,
    [order.shippingCity, order.shippingState, order.shippingZip].filter(Boolean).join(", "),
    order.shippingCountry,
  ].filter((l) => l && l.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <Link href={`/stores/${order.storeId}/orders`} className="text-xs text-brand-700 hover:underline">
                ← All orders
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900">{order.orderNumber}</h1>
                <Badge status={order.status} />
              </div>
              <p className="text-sm text-slate-500">Placed {fmtDate(order.placedAt)}</p>
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs uppercase text-slate-500">Order total</p>
                <p className="text-xl font-semibold text-slate-900">{formatMoney(total, cur)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Supplier cost (≈ {cur})</p>
                <p className="text-xl font-semibold text-slate-900">
                  {order.purchases.length ? formatMoney(costInOrderCur, cur) : "—"}
                </p>
              </div>
              <div className="w-44">
                <p className="mb-1 text-xs uppercase text-slate-500">Status</p>
                <Select value={order.status} disabled={statusBusy} onChange={(e) => changeStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-slate-500">Customer</p>
              <p className="font-medium text-slate-800">{order.customerName}</p>
              {order.customerEmail && <p className="text-slate-600">{order.customerEmail}</p>}
              {order.customerPhone && <p className="text-slate-600">{order.customerPhone}</p>}
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Ship to</p>
              {addressLines.length ? (
                addressLines.map((l, i) => (
                  <p key={i} className="whitespace-pre-line text-slate-600">
                    {l}
                  </p>
                ))
              ) : (
                <p className="text-slate-400">No address</p>
              )}
            </div>
            {order.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase text-slate-500">Notes</p>
                <p className="whitespace-pre-line text-slate-600">{order.notes}</p>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Items</h3>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Variant</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit price</th>
                <th className="px-5 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{i.title}</td>
                  <td className="px-5 py-3 text-slate-600">{i.variantName ?? "—"}</td>
                  <td className="px-5 py-3 text-right">{i.quantity}</td>
                  <td className="px-5 py-3 text-right">{formatMoney(i.sellingPrice, cur)}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatMoney(i.sellingPrice * i.quantity, cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={4} className="px-5 py-3 text-right text-slate-500">
                  Total
                </td>
                <td className="px-5 py-3 text-right font-semibold">{formatMoney(total, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <PurchasePanel
        order={order}
        cur={cur}
        supplierAccounts={supplierAccounts}
        supplierGroups={supplierGroups}
        onChanged={reload}
      />
      <ShipmentsPanel order={order} onChanged={reload} onShipmentUpdated={(s) => {
        setOrder((o) => ({ ...o, shipments: o.shipments.map((x) => (x.id === s.id ? s : x)) }));
      }} />

      {/* Timeline */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Order timeline</h3>
        </CardHeader>
        <CardBody>
          {order.events.length === 0 ? (
            <p className="text-sm text-slate-400">No events yet.</p>
          ) : (
            <ol className="space-y-3">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-slate-800">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                        {e.type.replace(/_/g, " ")}
                      </span>
                      {e.message}
                    </p>
                    <p className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier purchase panel
// ---------------------------------------------------------------------------

function PurchasePanel({
  order,
  cur,
  supplierAccounts,
  supplierGroups,
  onChanged,
}: {
  order: OrderDetailData;
  cur: Cur;
  supplierAccounts: SupplierAccountOption[];
  supplierGroups: SupplierGroup[];
  onChanged: () => Promise<void>;
}) {
  const [supplierAccountId, setSupplierAccountId] = useState("");
  const [listingSupplierId, setListingSupplierId] = useState<string | null>(null);
  const [supplierOrderNo, setSupplierOrderNo] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [buyingCurrency, setBuyingCurrency] = useState<Cur>("USD");
  const [cainiaoTrackingNo, setCainiaoTrackingNo] = useState("");
  const [markProcessing, setMarkProcessing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickSupplier(s: RankedSupplier) {
    setListingSupplierId(s.id);
    if (s.unitPrice != null) setBuyingPrice(String(s.unitPrice));
    setBuyingCurrency(s.currency as Cur);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}/purchase`, {
        method: "POST",
        body: JSON.stringify({
          supplierAccountId: supplierAccountId || null,
          listingSupplierId: listingSupplierId || null,
          supplierOrderNo: supplierOrderNo.trim() || null,
          buyingPrice: Number(buyingPrice),
          buyingCurrency,
          cainiaoTrackingNo: cainiaoTrackingNo.trim() || null,
          markProcessing,
        }),
      });
      setSupplierOrderNo("");
      setBuyingPrice("");
      setCainiaoTrackingNo("");
      setListingSupplierId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add purchase");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-slate-800">Supplier purchases</h3>
      </CardHeader>
      <CardBody className="space-y-5">
        {order.purchases.length === 0 ? (
          <p className="text-sm text-slate-400">No supplier purchase recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Supplier order #</th>
                  <th className="py-2 pr-3">Paid</th>
                  <th className="py-2 pr-3">≈ In {cur} (FX approx.)</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">Cainiao tracking</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 font-medium text-slate-800">{p.supplierOrderNo ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {formatMoney(p.buyingPrice, p.buyingCurrency)} {p.buyingCurrency}
                    </td>
                    <td className="py-2 pr-3">
                      {p.buyingPriceInOrderCurrency != null ? (
                        <>
                          ≈ {formatMoney(p.buyingPriceInOrderCurrency, cur)}
                          {p.buyingCurrency !== cur && p.fxRateUsed != null && (
                            <span className="block text-xs text-slate-400">
                              fx rate {p.fxRateUsed.toFixed(4)} ({p.buyingCurrency}→{cur})
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {p.supplierAccount ? (
                        <>
                          {p.supplierAccount.label}
                          <span className="block text-xs text-slate-400">{p.supplierAccount.emailMasked}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">{p.cainiaoTrackingNo ?? "—"}</td>
                    <td className="py-2 text-slate-500">{fmtDate(p.purchasedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {supplierGroups.length > 0 && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">Choose supplier</p>
            {supplierGroups.map((g) => (
              <SupplierGroupBlock
                key={g.listingId}
                group={g}
                storeCur={cur}
                showTitle={supplierGroups.length > 1}
                selectedId={listingSupplierId}
                onPick={pickSupplier}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Supplier account">
            <Select value={supplierAccountId} onChange={(e) => setSupplierAccountId(e.target.value)}>
              <option value="">— none —</option>
              {supplierAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.emailMasked})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier order number">
            <Input value={supplierOrderNo} onChange={(e) => setSupplierOrderNo(e.target.value)} placeholder="AliExpress order #" />
          </Field>
          <Field label="Cainiao tracking number" hint="Adds & syncs a supplier shipment">
            <Input value={cainiaoTrackingNo} onChange={(e) => setCainiaoTrackingNo(e.target.value)} placeholder="LP00…" />
          </Field>
          <Field label="Buying price">
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={buyingPrice}
              onChange={(e) => setBuyingPrice(e.target.value)}
            />
          </Field>
          <Field
            label="Buying currency"
            hint={buyingCurrency !== cur ? `Converted to ${cur} at today's rate (approximate)` : undefined}
          >
            <Select value={buyingCurrency} onChange={(e) => setBuyingCurrency(e.target.value as Cur)}>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={markProcessing}
                onChange={(e) => setMarkProcessing(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Mark order as processing
            </label>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{error}</p>}
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy || buyingPrice === ""}>
              {busy ? "Saving…" : "Add purchase"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function SupplierBadges({ s }: { s: RankedSupplier }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {s.recommended && (
        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Recommended
        </span>
      )}
      {s.cheapest && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Cheapest
        </span>
      )}
      {s.fastest && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          Fastest
        </span>
      )}
    </span>
  );
}

function SupplierGroupBlock({
  group,
  storeCur,
  showTitle,
  selectedId,
  onPick,
  onChanged,
}: {
  group: SupplierGroup;
  storeCur: Cur;
  showTitle: boolean;
  selectedId: string | null;
  onPick: (s: RankedSupplier) => void;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      {showTitle && <p className="mb-2 text-xs font-medium text-slate-500">{group.listingTitle}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {group.suppliers.map((s) => {
          const selected = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className={`rounded-lg border p-3 text-left transition ${
                selected ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
                <SupplierBadges s={s} />
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {s.landedPrice != null ? (
                  <>
                    <span className="font-semibold">{formatMoney(s.landedPrice, storeCur)}</span>
                    {s.currency !== storeCur && s.unitPrice != null && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({CURRENCY_SYMBOLS[s.currency as keyof typeof CURRENCY_SYMBOLS] ?? ""}
                        {s.unitPrice} {s.currency})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">No price set</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {s.shipDaysUS != null || s.shipDaysUK != null ? (
                  <>
                    Ship:{s.shipDaysUS != null ? ` US ${s.shipDaysUS}d` : ""}
                    {s.shipDaysUS != null && s.shipDaysUK != null ? " ·" : ""}
                    {s.shipDaysUK != null ? ` UK ${s.shipDaysUK}d` : ""}
                  </>
                ) : (
                  "Shipping time not set"
                )}
              </div>
            </button>
          );
        })}
      </div>
      {adding ? (
        <AddSupplierInline
          listingId={group.listingId}
          onDone={async () => {
            setAdding(false);
            await onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          + Add new supplier
        </button>
      )}
    </div>
  );
}

function AddSupplierInline({
  listingId,
  onDone,
  onCancel,
}: {
  listingId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("AliExpress");
  const [url, setUrl] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState<Cur>("USD");
  const [shipUS, setShipUS] = useState("");
  const [shipUK, setShipUK] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/listings/${listingId}/suppliers`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "AliExpress",
          url: url.trim() || null,
          unitPrice: unitPrice === "" ? null : Number(unitPrice),
          currency,
          shipDaysUS: shipUS === "" ? null : Math.round(Number(shipUS)),
          shipDaysUK: shipUK === "" ? null : Math.round(Number(shipUK)),
        }),
      });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add supplier");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" />
        <div className="col-span-1 sm:col-span-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Product URL (optional)" />
        </div>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="Unit price"
        />
        <Select value={currency} onChange={(e) => setCurrency(e.target.value as Cur)}>
          <option value="USD">USD ($)</option>
          <option value="GBP">GBP (£)</option>
          <option value="EUR">EUR (€)</option>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min="0" value={shipUS} onChange={(e) => setShipUS(e.target.value)} placeholder="US days" />
          <Input type="number" min="0" value={shipUK} onChange={(e) => setShipUK(e.target.value)} placeholder="UK days" />
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save supplier"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipments / tracking panel
// ---------------------------------------------------------------------------

function ShipmentsPanel({
  order,
  onChanged,
  onShipmentUpdated,
}: {
  order: OrderDetailData;
  onChanged: () => Promise<void>;
  onShipmentUpdated: (s: ShipmentData) => void;
}) {
  const [kind, setKind] = useState<"CUSTOMER" | "SUPPLIER">("CUSTOMER");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrierCode, setCarrierCode] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplier = order.shipments.filter((s) => s.kind === "SUPPLIER");
  const customer = order.shipments.filter((s) => s.kind === "CUSTOMER");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/shipments", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          kind,
          trackingNumber: trackingNumber.trim(),
          carrierCode: kind === "CUSTOMER" && carrierCode !== "auto" ? carrierCode : null,
        }),
      });
      setTrackingNumber("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tracking");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-slate-800">Shipments &amp; tracking</h3>
      </CardHeader>
      <CardBody className="space-y-6">
        <ShipmentGroup
          title="Supplier (Cainiao / AliExpress)"
          empty="No supplier tracking yet. Add a Cainiao number in the purchase form above, or below."
          shipments={supplier}
          onChanged={onChanged}
          onShipmentUpdated={onShipmentUpdated}
        />
        <ShipmentGroup
          title="Customer (FedEx/USPS/UPS)"
          empty="No customer tracking yet. Add the number you give the buyer below."
          shipments={customer}
          onChanged={onChanged}
          onShipmentUpdated={onShipmentUpdated}
        />

        <form onSubmit={add} className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <Field label="Tracking type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "CUSTOMER" | "SUPPLIER")}>
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
            </Select>
          </Field>
          <Field label="Tracking number">
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} required minLength={3} />
          </Field>
          <Field label="Carrier">
            <Select value={carrierCode} onChange={(e) => setCarrierCode(e.target.value)} disabled={kind === "SUPPLIER"}>
              <option value="auto">Auto-detect</option>
              <option value="fedex">FedEx</option>
              <option value="usps">USPS</option>
              <option value="ups">UPS</option>
              <option value="dhl">DHL</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || trackingNumber.trim().length < 3}>
              {busy ? "Adding…" : "Add tracking"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
        </form>
      </CardBody>
    </Card>
  );
}

function ShipmentGroup({
  title,
  empty,
  shipments,
  onChanged,
  onShipmentUpdated,
}: {
  title: string;
  empty: string;
  shipments: ShipmentData[];
  onChanged: () => Promise<void>;
  onShipmentUpdated: (s: ShipmentData) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      {shipments.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <ShipmentCard key={s.id} shipment={s} onChanged={onChanged} onShipmentUpdated={onShipmentUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}

const SHIPMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "INFO_RECEIVED", label: "Info received" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "EXCEPTION", label: "Exception" },
  { value: "EXPIRED", label: "Expired" },
  { value: "UNKNOWN", label: "Unknown" },
];

function ShipmentCard({
  shipment: s,
  onChanged,
  onShipmentUpdated,
}: {
  shipment: ShipmentData;
  onChanged: () => Promise<void>;
  onShipmentUpdated: (s: ShipmentData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"sync" | "remove" | "status" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setManualStatus(status: string) {
    setBusy("status");
    setErr(null);
    setMsg(null);
    try {
      const out = await api<{ shipment: ShipmentData }>(`/api/shipments/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onShipmentUpdated(out.shipment);
      setMsg(`Marked ${status.replace(/_/g, " ").toLowerCase()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("sync");
    setErr(null);
    setMsg(null);
    try {
      const out = await api<{ outcome: { ok: boolean; newEvents: number; error?: string }; shipment: ShipmentData }>(
        `/api/shipments/${s.id}/sync`,
        { method: "POST" }
      );
      onShipmentUpdated(out.shipment);
      setMsg(
        out.outcome.ok
          ? `${out.outcome.newEvents} new event${out.outcome.newEvents === 1 ? "" : "s"}`
          : `Sync failed${out.outcome.error ? `: ${out.outcome.error}` : ""}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove tracking ${s.trackingNumber}?`)) return;
    setBusy("remove");
    setErr(null);
    try {
      await api(`/api/shipments/${s.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={s.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-medium text-brand-700 hover:underline"
            >
              {s.trackingNumber}
            </a>
            <Badge status={s.status}>{s.status.replace(/_/g, " ")}</Badge>
            {s.carrierName || s.carrierCode ? (
              <span className="text-xs text-slate-500">{s.carrierName ?? s.carrierCode?.toUpperCase()}</span>
            ) : null}
          </div>
          {s.statusDetail && <p className="text-sm text-slate-700">{s.statusDetail}</p>}
          <p className="text-xs text-slate-400">
            Last synced {s.lastSyncedAt ? fmtDateTime(s.lastSyncedAt) : "never"}
            {s.estimatedDelivery ? ` · ETA ${fmtDate(s.estimatedDelivery)}` : ""}
          </p>
          {s.syncError && <p className="text-xs text-amber-600">Last sync issue: {s.syncError}</p>}
          {msg && <p className="text-xs text-slate-500">{msg}</p>}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} disabled={busy !== null}>
            {busy === "sync" ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Events"} ({s.events.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} disabled={busy !== null}>
            Remove
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-medium text-slate-500">Set status</span>
        <Select
          value={s.status}
          onChange={(e) => setManualStatus(e.target.value)}
          disabled={busy !== null}
          className="h-8 w-44 py-1 text-xs"
        >
          {SHIPMENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {busy === "status" && <span className="text-xs text-slate-400">saving…</span>}
        <span className="ml-auto text-xs text-slate-400">keyless UPS / USPS / FedEx / Cainiao sync + manual override</span>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {s.events.length === 0 ? (
            <p className="text-sm text-slate-400">No tracking events yet.</p>
          ) : (
            <ol className="space-y-3">
              {s.events.map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <div>
                    <p className="text-slate-800">{ev.description}</p>
                    <p className="text-xs text-slate-400">
                      {fmtDateTime(ev.time)}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
