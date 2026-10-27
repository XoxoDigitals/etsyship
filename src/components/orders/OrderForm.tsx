"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { formatMoney, CURRENCY_SYMBOLS } from "@/lib/money";
import { parseAddressBlock } from "@/lib/address";

export interface FormVariant {
  id: string;
  name: string;
  listedPrice: number | null;
  supplierPrice: number | null;
  imageUrl: string | null;
}
export interface FormListing {
  id: string;
  title: string;
  listedPrice: number | null;
  supplierCurrency: string;
  imageUrl: string | null;
  variants: FormVariant[];
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts aren't in next.config
    return <img src={url} alt={alt} loading="lazy" className="h-28 w-full rounded-lg object-cover" />;
  }
  return (
    <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-300">
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

interface Line {
  key: string;
  listingId: string | null;
  variantId: string | null;
  title: string;
  variantName: string | null;
  quantity: number;
  sellingPrice: string;
}

type Cur = "USD" | "GBP" | "EUR";
let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function OrderForm({
  storeId,
  storeCurrency,
  listings,
}: {
  storeId: string;
  storeCurrency: string;
  listings: FormListing[];
}) {
  const router = useRouter();
  const cur = storeCurrency as Cur;

  // Cart
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // Order + customer
  const [orderNumber, setOrderNumber] = useState("");
  const [addressBlock, setAddressBlock] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingCountry, setShippingCountry] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [editAddress, setEditAddress] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? listings.filter((l) => l.title.toLowerCase().includes(s)) : listings;
  }, [listings, search]);

  const total = lines.reduce((sum, l) => sum + (Number(l.sellingPrice) || 0) * l.quantity, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const hasParsed = Boolean(customerName || shippingAddress || shippingCity || shippingCountry);

  function addProduct(listing: FormListing, variant?: FormVariant) {
    const price = variant?.listedPrice ?? listing.listedPrice ?? 0;
    setLines((prev) => {
      // Bump quantity if the same listing/variant is already in the cart.
      const existing = prev.find((l) => l.listingId === listing.id && l.variantId === (variant?.id ?? null));
      if (existing) return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          key: nextKey(),
          listingId: listing.id,
          variantId: variant?.id ?? null,
          title: listing.title,
          variantName: variant?.name ?? null,
          quantity: 1,
          sellingPrice: String(price),
        },
      ];
    });
  }

  function addCustomLine() {
    if (!customTitle.trim()) return;
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        listingId: null,
        variantId: null,
        title: customTitle.trim(),
        variantName: null,
        quantity: 1,
        sellingPrice: customPrice || "0",
      },
    ]);
    setCustomTitle("");
    setCustomPrice("");
  }

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function onPasteAddress(value: string) {
    setAddressBlock(value);
    const p = parseAddressBlock(value);
    setCustomerName(p.name);
    setShippingAddress(p.address);
    setShippingCity(p.city);
    setShippingState(p.state);
    setShippingZip(p.zip);
    setShippingCountry(p.country);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!lines.length) return setError("Add at least one product to the order.");
    if (!orderNumber.trim()) return setError("Enter the order number.");
    if (!customerName.trim()) return setError("Enter the customer name (paste their address block).");

    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId,
          orderNumber: orderNumber.trim(),
          currency: cur,
          customerName: customerName.trim(),
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
          shippingAddress: shippingAddress || null,
          shippingCity: shippingCity || null,
          shippingState: shippingState || null,
          shippingZip: shippingZip || null,
          shippingCountry: shippingCountry || null,
          notes: notes || null,
          items: lines.map((l) => ({
            listingId: l.listingId,
            variantId: l.variantId,
            title: l.title,
            variantName: l.variantName,
            quantity: l.quantity,
            sellingPrice: Number(l.sellingPrice) || 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to create order");
        setLoading(false);
        return;
      }
      router.push(`/stores/${storeId}/orders/${json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ---------- Catalog (left) ---------- */}
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Products</h3>
            <div className="relative w-56">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m14 14 4 4" strokeLinecap="round" />
              </svg>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search listings…"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardBody>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {listings.length ? "No listings match your search." : "No active listings yet — use a custom item below."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((l) => {
                  const base = l.listedPrice;
                  if (l.variants.length === 0) {
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => addProduct(l)}
                        className="group flex flex-col rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-brand-400 hover:shadow-md"
                      >
                        <Thumb url={l.imageUrl} alt={l.title} />
                        <span className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">{l.title}</span>
                        <span className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {base != null ? formatMoney(base, cur) : "—"}
                          </span>
                          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 group-hover:bg-brand-100">
                            + Add
                          </span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                      <Thumb url={l.imageUrl} alt={l.title} />
                      <div className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">{l.title}</div>
                      <div className="mt-0.5 text-xs text-slate-400">Pick a variant</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {l.variants.map((v) => {
                          const vp = v.listedPrice ?? base;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => addProduct(l, v)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                            >
                              {v.name}
                              {vp != null && <span className="text-slate-400">· {formatMoney(vp, cur)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Custom item">
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Item not in your listings"
                  />
                </Field>
              </div>
              <div className="w-full sm:w-32">
                <Field label={`Price (${storeCurrency})`}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <Button type="button" variant="secondary" onClick={addCustomLine} disabled={!customTitle.trim()}>
                + Add
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ---------- Ticket (right) ---------- */}
      <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Order ticket</h3>
            <span className="text-xs font-medium text-slate-400">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </CardHeader>
          <CardBody className="space-y-4">
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                Tap a product to add it here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-start gap-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{l.title}</div>
                      {l.variantName && <div className="truncate text-xs text-slate-500">{l.variantName}</div>}
                      {!l.listingId && <div className="text-xs text-slate-400">Custom item</div>}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => patchLine(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                            className="px-2 py-1 text-slate-500 hover:text-slate-800"
                            aria-label="Decrease quantity"
                          >
                            –
                          </button>
                          <span className="w-7 text-center text-sm tabular-nums">{l.quantity}</span>
                          <button
                            type="button"
                            onClick={() => patchLine(l.key, { quantity: l.quantity + 1 })}
                            className="px-2 py-1 text-slate-500 hover:text-slate-800"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-slate-300">×</span>
                        <div className="relative w-24">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            {CURRENCY_SYMBOLS[cur]}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.sellingPrice}
                            onChange={(e) => patchLine(l.key, { sellingPrice: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 py-1 pl-5 pr-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatMoney((Number(l.sellingPrice) || 0) * l.quantity, cur)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">Total</span>
              <span className="text-xl font-semibold text-slate-900">{formatMoney(total, cur)}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <Field label="Order number">
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Paste the order #"
                autoComplete="off"
              />
            </Field>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Customer &amp; shipping</span>
                {hasParsed && (
                  <button
                    type="button"
                    onClick={() => setEditAddress((v) => !v)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {editAddress ? "Done" : "Edit"}
                  </button>
                )}
              </div>
              <Textarea
                rows={4}
                value={addressBlock}
                onChange={(e) => onPasteAddress(e.target.value)}
                placeholder={"Paste name + address, e.g.\nJacinda Taylor\n1034 Shedd Rd\nBREMEN, GA 30110-4027\nUnited States"}
                className="font-mono text-xs leading-relaxed"
              />

              {hasParsed && !editAddress && (
                <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-800">{customerName || "—"}</div>
                  {shippingAddress && <div className="text-slate-600">{shippingAddress}</div>}
                  <div className="text-slate-600">
                    {[shippingCity, shippingState].filter(Boolean).join(", ")}
                    {shippingZip ? ` ${shippingZip}` : ""}
                  </div>
                  {shippingCountry && <div className="text-slate-600">{shippingCountry}</div>}
                </div>
              )}

              {editAddress && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Field label="Name">
                      <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Address">
                      <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="City">
                    <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} />
                  </Field>
                  <Field label="State">
                    <Input value={shippingState} onChange={(e) => setShippingState(e.target.value)} />
                  </Field>
                  <Field label="ZIP">
                    <Input value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} />
                  </Field>
                  <Field label="Country">
                    <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            {!showMore ? (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                + Email, phone, notes
              </button>
            ) : (
              <div className="space-y-3">
                <Field label="Email">
                  <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </Field>
                <Field label="Notes">
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full py-2.5">
              {loading ? "Creating…" : `Place order · ${formatMoney(total, cur)}`}
            </Button>
            <button
              type="button"
              onClick={() => router.push(`/stores/${storeId}/orders`)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
