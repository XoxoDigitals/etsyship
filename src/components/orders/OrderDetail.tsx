"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { CURRENCY_SYMBOLS } from "@/lib/money";
import { parseAddressBlock } from "@/lib/address";
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
  listingSupplierId?: string | null;
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

  // Edit Customer & Address state
  const [editingDetails, setEditingDetails] = useState(false);
  const [editOrderNumber, setEditOrderNumber] = useState(order.orderNumber);
  const [editCustomerName, setEditCustomerName] = useState(order.customerName);
  const [editCustomerEmail, setEditCustomerEmail] = useState(order.customerEmail ?? "");
  const [editCustomerPhone, setEditCustomerPhone] = useState(order.customerPhone ?? "");
  const [editShippingAddress, setEditShippingAddress] = useState(order.shippingAddress ?? "");
  const [editShippingCity, setEditShippingCity] = useState(order.shippingCity ?? "");
  const [editShippingState, setEditShippingState] = useState(order.shippingState ?? "");
  const [editShippingZip, setEditShippingZip] = useState(order.shippingZip ?? "");
  const [editShippingCountry, setEditShippingCountry] = useState(order.shippingCountry ?? "");
  const [pasteBlock, setPasteBlock] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Notes anytime state
  const [notesValue, setNotesValue] = useState(order.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedMsg, setNotesSavedMsg] = useState<string | null>(null);

  // Edit Line Items state
  const [editingItems, setEditingItems] = useState(false);
  const [draftItems, setDraftItems] = useState(
    order.items.map((i) => ({
      id: i.id,
      listingId: i.listingId,
      variantId: i.variantId,
      title: i.title,
      variantName: i.variantName ?? "",
      quantity: String(i.quantity),
      sellingPrice: String(i.sellingPrice),
    }))
  );
  const [savingItems, setSavingItems] = useState(false);

  const cur = (order.currency || storeCurrency) as Cur;

  async function reload() {
    try {
      const fresh = await api<OrderDetailData>(`/api/orders/${order.id}`);
      setOrder(fresh);
      setNotesValue(fresh.notes ?? "");
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

  async function refundOrder() {
    if (!window.confirm(`Mark order "${order.orderNumber}" as REFUNDED?`)) return;
    await changeStatus("REFUNDED");
  }

  async function deleteOrder() {
    if (!window.confirm(`Permanently delete order "${order.orderNumber}"? This cannot be undone.`)) return;
    setStatusBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, { method: "DELETE" });
      router.push(`/stores/${order.storeId}/orders`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete order");
      setStatusBusy(false);
    }
  }

  function startEditDetails() {
    setEditOrderNumber(order.orderNumber);
    setEditCustomerName(order.customerName);
    setEditCustomerEmail(order.customerEmail ?? "");
    setEditCustomerPhone(order.customerPhone ?? "");
    setEditShippingAddress(order.shippingAddress ?? "");
    setEditShippingCity(order.shippingCity ?? "");
    setEditShippingState(order.shippingState ?? "");
    setEditShippingZip(order.shippingZip ?? "");
    setEditShippingCountry(order.shippingCountry ?? "");
    setPasteBlock("");
    setEditingDetails(true);
  }

  function handlePasteAddress(val: string) {
    setPasteBlock(val);
    if (!val.trim()) return;
    const p = parseAddressBlock(val);
    if (p.name) setEditCustomerName(p.name);
    if (p.address) setEditShippingAddress(p.address);
    if (p.city) setEditShippingCity(p.city);
    if (p.state) setEditShippingState(p.state);
    if (p.zip) setEditShippingZip(p.zip);
    if (p.country) setEditShippingCountry(p.country);
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomerName.trim()) {
      setError("Customer name is required");
      return;
    }
    setSavingDetails(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          orderNumber: editOrderNumber.trim(),
          customerName: editCustomerName.trim(),
          customerEmail: editCustomerEmail.trim() || null,
          customerPhone: editCustomerPhone.trim() || null,
          shippingAddress: editShippingAddress.trim() || null,
          shippingCity: editShippingCity.trim() || null,
          shippingState: editShippingState.trim() || null,
          shippingZip: editShippingZip.trim() || null,
          shippingCountry: editShippingCountry.trim() || null,
        }),
      });
      setEditingDetails(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order details");
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    setNotesSavedMsg(null);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesValue.trim() || null }),
      });
      setNotesSavedMsg("Notes saved");
      await reload();
      setTimeout(() => setNotesSavedMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  function startEditItems() {
    setDraftItems(
      order.items.map((i) => ({
        id: i.id,
        listingId: i.listingId,
        variantId: i.variantId,
        title: i.title,
        variantName: i.variantName ?? "",
        quantity: String(i.quantity),
        sellingPrice: String(i.sellingPrice),
      }))
    );
    setEditingItems(true);
  }

  async function saveItems(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = draftItems
      .filter((i) => i.title.trim())
      .map((i) => ({
        listingId: i.listingId || null,
        variantId: i.variantId || null,
        title: i.title.trim(),
        variantName: i.variantName.trim() || null,
        quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
        sellingPrice: Math.max(0, Number(i.sellingPrice) || 0),
      }));
    if (cleaned.length === 0) {
      setError("Order must have at least one item");
      return;
    }
    setSavingItems(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ items: cleaned }),
      });
      setEditingItems(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order items");
    } finally {
      setSavingItems(false);
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
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900">{order.orderNumber}</h1>
                <Badge status={order.status} />
              </div>
              <p className="text-sm text-slate-500">Placed {fmtDate(order.placedAt)}</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
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
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={startEditDetails}>
                  Edit order &amp; address
                </Button>
                {order.status !== "REFUNDED" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    disabled={statusBusy}
                    onClick={refundOrder}
                  >
                    Refund order
                  </Button>
                )}
                <Button type="button" size="sm" variant="danger" disabled={statusBusy} onClick={deleteOrder}>
                  Delete order
                </Button>
              </div>
            </div>
          </div>

          {editingDetails ? (
            <form onSubmit={saveDetails} className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Edit Order, Customer &amp; Shipping Address</h4>
                <button
                  type="button"
                  onClick={() => setEditingDetails(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Order number">
                  <Input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} required />
                </Field>
                <Field label="Customer name">
                  <Input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} required />
                </Field>
                <Field label="Customer email">
                  <Input type="email" value={editCustomerEmail} onChange={(e) => setEditCustomerEmail(e.target.value)} />
                </Field>
                <Field label="Customer phone">
                  <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Street address">
                    <Input value={editShippingAddress} onChange={(e) => setEditShippingAddress(e.target.value)} />
                  </Field>
                </div>
                <Field label="City">
                  <Input value={editShippingCity} onChange={(e) => setEditShippingCity(e.target.value)} />
                </Field>
                <Field label="State / Province">
                  <Input value={editShippingState} onChange={(e) => setEditShippingState(e.target.value)} />
                </Field>
                <Field label="ZIP / Postal code">
                  <Input value={editShippingZip} onChange={(e) => setEditShippingZip(e.target.value)} />
                </Field>
                <Field label="Country">
                  <Input value={editShippingCountry} onChange={(e) => setEditShippingCountry(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Quick paste address block (optional — auto-fills name & address fields)">
                    <Textarea
                      rows={2}
                      value={pasteBlock}
                      onChange={(e) => handlePasteAddress(e.target.value)}
                      placeholder="Paste full buyer name + address block here to auto-fill…"
                      className="font-mono text-xs"
                    />
                  </Field>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={savingDetails}>
                  {savingDetails ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingDetails(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase text-slate-500">Customer</p>
                  <button
                    type="button"
                    onClick={startEditDetails}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <p className="font-medium text-slate-800">{order.customerName}</p>
                {order.customerEmail && <p className="text-slate-600">{order.customerEmail}</p>}
                {order.customerPhone && <p className="text-slate-600">{order.customerPhone}</p>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase text-slate-500">Ship to</p>
                  <button
                    type="button"
                    onClick={startEditDetails}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
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
            </div>
          )}

          {/* Always-available Order Notes section */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order notes</label>
              {notesSavedMsg && <span className="text-xs font-medium text-emerald-600">{notesSavedMsg}</span>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Textarea
                rows={2}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add order notes, custom instructions, or buyer messages anytime…"
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={savingNotes || notesValue.trim() === (order.notes ?? "").trim()}
                onClick={saveNotes}
                className="shrink-0"
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Items</h3>
          {!editingItems && (
            <Button type="button" size="sm" variant="secondary" onClick={startEditItems}>
              Edit items
            </Button>
          )}
        </CardHeader>
        {editingItems ? (
          <CardBody>
            <form onSubmit={saveItems} className="space-y-3">
              {draftItems.map((it, idx) => (
                <div key={it.id || idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Field label="Product title">
                      <Input
                        value={it.title}
                        onChange={(e) =>
                          setDraftItems((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
                        }
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Variant">
                    <Input
                      value={it.variantName}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, variantName: e.target.value } : x))
                        )
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Qty">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={it.quantity}
                      onChange={(e) =>
                        setDraftItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                      }
                      required
                    />
                  </Field>
                  <Field label={`Unit price (${cur})`}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.sellingPrice}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, sellingPrice: e.target.value } : x))
                        )
                      }
                      required
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      disabled={draftItems.length <= 1}
                      onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDraftItems((prev) => [
                      ...prev,
                      {
                        id: `new-${Date.now()}`,
                        listingId: null,
                        variantId: null,
                        title: "",
                        variantName: "",
                        quantity: "1",
                        sellingPrice: "0",
                      },
                    ])
                  }
                >
                  + Add item line
                </Button>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={savingItems}>
                    {savingItems ? "Saving…" : "Save items"}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingItems(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        ) : (
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
        )}
      </Card>

      <PurchasePanel
        order={order}
        cur={cur}
        supplierAccounts={supplierAccounts}
        supplierGroups={supplierGroups}
        onChanged={reload}
      />
      <ShipmentsPanel
        order={order}
        onChanged={reload}
        onShipmentUpdated={(s) => {
          setOrder((o) => ({
            ...o,
            status: s.delivered && ["NEW", "PROCESSING", "SHIPPED"].includes(o.status) ? "DELIVERED" : o.status,
            shipments: o.shipments.map((x) => (x.id === s.id ? s : x)),
          }));
        }}
      />

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
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
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
    setListingSupplierId(s.id.startsWith("legacy-") ? null : s.id);
    if (s.unitPrice != null) setBuyingPrice(String(s.unitPrice));
    setBuyingCurrency(s.currency as Cur);
  }

  function startEditPurchase(p: PurchaseData) {
    setEditingPurchaseId(p.id);
    setSupplierAccountId(p.supplierAccountId ?? "");
    setListingSupplierId(p.listingSupplierId ?? null);
    setSupplierOrderNo(p.supplierOrderNo ?? "");
    setBuyingPrice(String(p.buyingPrice));
    setBuyingCurrency(p.buyingCurrency);
    setCainiaoTrackingNo(p.cainiaoTrackingNo ?? "");
    setError(null);
  }

  function cancelEditPurchase() {
    setEditingPurchaseId(null);
    setSupplierAccountId("");
    setListingSupplierId(null);
    setSupplierOrderNo("");
    setBuyingPrice("");
    setCainiaoTrackingNo("");
    setError(null);
  }

  async function removePurchase(id: string) {
    if (!window.confirm("Remove this supplier purchase record?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}/purchase?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (editingPurchaseId === id) cancelEditPurchase();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove purchase");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingPurchaseId) {
        await api(`/api/orders/${order.id}/purchase`, {
          method: "PATCH",
          body: JSON.stringify({
            id: editingPurchaseId,
            supplierAccountId: supplierAccountId || null,
            listingSupplierId: listingSupplierId || null,
            supplierOrderNo: supplierOrderNo.trim() || null,
            buyingPrice: Number(buyingPrice),
            buyingCurrency,
            cainiaoTrackingNo: cainiaoTrackingNo.trim() || null,
            markProcessing,
          }),
        });
      } else {
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
      }
      cancelEditPurchase();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save purchase");
    } finally {
      setBusy(false);
    }
  }

  // Find selected supplier URL or first available supplier URL for quick Visit Supplier button
  const allSuppliers = supplierGroups.flatMap((g) => g.suppliers);
  const activeSupplier =
    allSuppliers.find((s) => s.id === listingSupplierId) ??
    allSuppliers.find((s) => s.recommended && s.url) ??
    allSuppliers.find((s) => s.url);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">Supplier purchases</h3>
        {activeSupplier?.url && (
          <a
            href={activeSupplier.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            Visit supplier ({activeSupplier.name}) ↗
          </a>
        )}
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
                  <th className="py-2 pr-3">Supplier tracking</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.purchases.map((p) => (
                  <tr key={p.id} className={editingPurchaseId === p.id ? "bg-brand-50/50" : undefined}>
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
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(p.purchasedAt)}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button type="button" size="sm" variant="secondary" onClick={() => startEditPurchase(p)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => removePurchase(p.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
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
          {editingPurchaseId && (
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800 sm:col-span-2 lg:col-span-3">
              <span>Editing recorded supplier purchase — update any field below and click Save changes.</span>
              <button type="button" onClick={cancelEditPurchase} className="underline hover:text-brand-900">
                Cancel edit
              </button>
            </div>
          )}
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
          <Field label="Supplier tracking number" hint="Cainiao, USPS, UPS, or FedEx number">
            <Input value={cainiaoTrackingNo} onChange={(e) => setCainiaoTrackingNo(e.target.value)} placeholder="LP00… / 1Z… / 9400…" />
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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy || buyingPrice === ""}>
              {busy ? "Saving…" : editingPurchaseId ? "Save purchase changes" : "Add purchase"}
            </Button>
            {editingPurchaseId && (
              <Button type="button" variant="secondary" onClick={cancelEditPurchase}>
                Cancel
              </Button>
            )}
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
            <div
              key={s.id}
              onClick={() => onPick(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPick(s);
              }}
              className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                selected ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
                <SupplierBadges s={s} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-700">
                <div>
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
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                  >
                    Visit supplier ↗
                  </a>
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
            </div>
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
          carrierCode: carrierCode !== "auto" ? carrierCode : null,
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
          title="Supplier Tracking (Cainiao / USPS / UPS / FedEx)"
          empty="No supplier tracking yet. Add a tracking number in the purchase form above, or below."
          shipments={supplier}
          onChanged={onChanged}
          onShipmentUpdated={onShipmentUpdated}
        />
        <ShipmentGroup
          title="Customer / Buyer Tracking (FedEx / USPS / UPS)"
          empty="No customer tracking yet. Add the number you give the buyer below."
          shipments={customer}
          onChanged={onChanged}
          onShipmentUpdated={onShipmentUpdated}
        />

        <form onSubmit={add} className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <Field label="Tracking type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "CUSTOMER" | "SUPPLIER")}>
              <option value="CUSTOMER">Customer (Buyer)</option>
              <option value="SUPPLIER">Supplier</option>
            </Select>
          </Field>
          <Field label="Tracking number">
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} required minLength={3} />
          </Field>
          <Field label="Carrier">
            <Select value={carrierCode} onChange={(e) => setCarrierCode(e.target.value)}>
              <option value="auto">Auto-detect</option>
              <option value="usps">USPS</option>
              <option value="ups">UPS</option>
              <option value="fedex">FedEx</option>
              <option value="cainiao">Cainiao / AliExpress</option>
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
      if (out.shipment.delivered) {
        await onChanged();
      }
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
      if (out.shipment.delivered) {
        await onChanged();
      }
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
