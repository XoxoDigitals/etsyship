"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type Cur = "USD" | "GBP" | "EUR";
type FetchStatus = "OK" | "PARTIAL" | "FAILED";

export type ListingFormInitial = {
  id: string;
  title: string;
  description: string | null;
  supplierUrl: string | null;
  supplierName: string | null;
  supplierPrice: number | null;
  supplierCurrency: Cur;
  listedPrice: number | null;
  status: string;
  fetchStatus?: FetchStatus;
  images: string[];
  variants: {
    id?: string;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    supplierPrice: number | null;
    listedPrice: number | null;
  }[];
  suppliers?: {
    id?: string;
    name: string;
    url: string | null;
    unitPrice: number | null;
    currency: Cur;
    shipDaysUS: number | null;
    shipDaysUK: number | null;
    notes: string | null;
    isDefault: boolean;
  }[];
};

type VariantState = {
  id?: string;
  name: string;
  sku: string;
  imageUrl: string;
  supplierPrice: string;
  listedPrice: string;
};

type SupplierState = {
  id?: string;
  name: string;
  url: string;
  unitPrice: string;
  currency: Cur;
  shipDaysUS: string;
  shipDaysUK: string;
  notes: string;
  isDefault: boolean;
};

type FetchResult = {
  status: FetchStatus;
  title?: string;
  description?: string;
  images: string[];
  price?: number;
  currency?: Cur;
  variants: { name: string; price?: number; imageUrl?: string }[];
};

const numStr = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toInt = (s: string): number | null => {
  const n = toNum(s);
  return n === null ? null : Math.round(n);
};

function blankSupplier(currency: Cur, isDefault = false): SupplierState {
  return { name: "AliExpress", url: "", unitPrice: "", currency, shipDaysUS: "", shipDaysUK: "", notes: "", isDefault };
}

// Upload an image from the user's device; on success calls onUploaded with the stored URL.
function UploadButton({
  upload,
  onUploaded,
}: {
  upload: (f: File) => Promise<string | null>;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 ${
        busy ? "opacity-60" : ""
      }`}
    >
      {busy ? "Uploading…" : "Upload"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const url = await upload(f);
          setBusy(false);
          if (url) onUploaded(url);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function ListingForm({
  storeId,
  storeCurrency,
  initial,
}: {
  storeId: string;
  storeCurrency: Cur;
  initial?: ListingFormInitial;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [listedPrice, setListedPrice] = useState(numStr(initial?.listedPrice));
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [images, setImages] = useState<string[]>(initial?.images?.length ? initial.images : [""]);
  const [variants, setVariants] = useState<VariantState[]>(
    (initial?.variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? "",
      imageUrl: v.imageUrl ?? "",
      supplierPrice: numStr(v.supplierPrice),
      listedPrice: numStr(v.listedPrice),
    }))
  );
  const [suppliers, setSuppliers] = useState<SupplierState[]>(() => {
    const init = initial?.suppliers?.length
      ? initial.suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          url: s.url ?? "",
          unitPrice: numStr(s.unitPrice),
          currency: s.currency,
          shipDaysUS: numStr(s.shipDaysUS),
          shipDaysUK: numStr(s.shipDaysUK),
          notes: s.notes ?? "",
          isDefault: s.isDefault,
        }))
      : [
          {
            name: initial?.supplierName ?? "AliExpress",
            url: initial?.supplierUrl ?? "",
            unitPrice: numStr(initial?.supplierPrice),
            currency: initial?.supplierCurrency ?? "USD",
            shipDaysUS: "",
            shipDaysUK: "",
            notes: "",
            isDefault: true,
          },
        ];
    if (!init.some((s) => s.isDefault)) init[0].isDefault = true;
    return init;
  });
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(initial?.fetchStatus ?? "FAILED");

  const [fetchingIdx, setFetchingIdx] = useState<number | null>(null);
  const [fetchMsg, setFetchMsg] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultSupplier = suppliers.find((s) => s.isDefault) ?? suppliers[0];
  const defSupplierPrice = defaultSupplier ? toNum(defaultSupplier.unitPrice) : null;
  const defSupplierCurrency = defaultSupplier?.currency ?? "USD";
  const sameCurrency = defSupplierCurrency === storeCurrency;

  async function fetchFromUrl(idx: number) {
    setFetchMsg(null);
    const url = suppliers[idx]?.url.trim();
    if (!url) {
      setFetchMsg({ kind: "error", text: "Enter a supplier URL on this row first." });
      return;
    }
    setFetchingIdx(idx);
    try {
      const res = await fetch("/api/listings/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, url }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFetchMsg({ kind: "error", text: `${json.error || "Fetch failed"}. You can still enter details manually.` });
        return;
      }
      const r = json.data as FetchResult;
      setFetchStatus(r.status);
      if (r.status === "FAILED") {
        setFetchMsg({
          kind: "warn",
          text: "Couldn't fetch details — AliExpress often blocks automated requests. Manual entry is fine.",
        });
        return;
      }
      if (r.title) setTitle(r.title);
      if (r.description) setDescription(r.description);
      if (r.images?.length) setImages(r.images);
      // Fill this supplier row's price/currency.
      setSuppliers((ss) =>
        ss.map((s, i) =>
          i === idx
            ? {
                ...s,
                unitPrice: r.price !== undefined ? String(r.price) : s.unitPrice,
                currency: r.currency ?? s.currency,
              }
            : s
        )
      );
      if (r.variants?.length) {
        setVariants(
          r.variants.map((v) => ({
            name: v.name,
            sku: "",
            imageUrl: v.imageUrl ?? "",
            supplierPrice: v.price !== undefined ? String(v.price) : "",
            listedPrice: "",
          }))
        );
      }
      setFetchMsg(
        r.status === "OK"
          ? { kind: "ok", text: "Fetched details from the URL. Review them before saving." }
          : { kind: "warn", text: "Only some details could be fetched (partial). Complete the rest manually." }
      );
    } catch {
      setFetchMsg({ kind: "error", text: "Network error while fetching. You can enter the details manually." });
    } finally {
      setFetchingIdx(null);
    }
  }

  function updateSupplier(i: number, patch: Partial<SupplierState>) {
    setSuppliers((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function setDefaultSupplier(i: number) {
    setSuppliers((ss) => ss.map((s, idx) => ({ ...s, isDefault: idx === i })));
  }
  function removeSupplier(i: number) {
    setSuppliers((ss) => {
      if (ss.length === 1) return ss; // keep at least one
      const next = ss.filter((_, idx) => idx !== i);
      if (!next.some((s) => s.isDefault)) next[0].isDefault = true;
      return next;
    });
  }

  function updateVariant(i: number, patch: Partial<VariantState>) {
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  async function uploadFile(file: File): Promise<string | null> {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || "Upload failed");
        return null;
      }
      return json.data.url as string;
    } catch {
      setError("Upload failed (network).");
      return null;
    }
  }

  // Profit preview: listedPrice (store currency) - default supplier unit price (supplier currency).
  const profit = useMemo(() => {
    const calc = (listed: number | null, supplier: number | null) =>
      listed === null || supplier === null ? null : listed - supplier;
    const baseListed = toNum(listedPrice);
    return {
      overall: calc(baseListed, defSupplierPrice),
      variants: variants.map((v) => calc(toNum(v.listedPrice) ?? baseListed, toNum(v.supplierPrice) ?? defSupplierPrice)),
    };
  }, [listedPrice, defSupplierPrice, variants]);

  function profitLabel(p: number | null) {
    if (p === null) return <span className="text-slate-400">—</span>;
    const cls = p >= 0 ? "text-emerald-600" : "text-red-600";
    return (
      <span className={`font-semibold ${cls}`}>
        {p < 0 ? "-" : ""}
        {formatMoney(Math.abs(p), storeCurrency)}
        {!sameCurrency && <span className="ml-1 text-xs font-normal text-slate-400">approx</span>}
      </span>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const supplierPayload = suppliers
        .filter((s) => s.name.trim())
        .map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          name: s.name.trim(),
          url: s.url.trim() || null,
          unitPrice: toNum(s.unitPrice),
          currency: s.currency,
          shipDaysUS: toInt(s.shipDaysUS),
          shipDaysUK: toInt(s.shipDaysUK),
          notes: s.notes.trim() || null,
          isDefault: s.isDefault,
        }));
      const payload = {
        storeId,
        title: title.trim(),
        description: description.trim() || null,
        supplierUrl: defaultSupplier?.url.trim() || null,
        supplierName: defaultSupplier?.name.trim() || "AliExpress",
        supplierPrice: defSupplierPrice,
        supplierCurrency: defSupplierCurrency,
        listedPrice: toNum(listedPrice),
        status,
        fetchStatus,
        images: images.map((u) => u.trim()).filter(Boolean),
        variants: variants
          .filter((v) => v.name.trim())
          .map((v) => ({
            ...(v.id ? { id: v.id } : {}),
            name: v.name.trim(),
            sku: v.sku.trim() || null,
            imageUrl: v.imageUrl.trim() || null,
            supplierPrice: toNum(v.supplierPrice),
            listedPrice: toNum(v.listedPrice),
          })),
        suppliers: supplierPayload,
      };
      const res = await fetch(editing ? `/api/listings/${initial!.id}` : "/api/listings", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        let msg: string = json.error || "Failed to save listing";
        const fieldErrors = json.issues?.fieldErrors as Record<string, string[]> | undefined;
        if (fieldErrors) {
          const details = Object.entries(fieldErrors)
            .map(([k, v]) => `${k}: ${v.join(", ")}`)
            .join("; ");
          if (details) msg += ` (${details})`;
        }
        setError(msg);
        return;
      }
      router.push(`/stores/${storeId}/listings`);
      router.refresh();
    } catch {
      setError("Network error while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const msgColor = {
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Suppliers */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">Suppliers</h3>
            <p className="text-xs text-slate-400">
              Add every place you can source this product. The default feeds the profit preview; at order time
              you&apos;ll get a recommendation based on price &amp; shipping speed.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setSuppliers((ss) => [...ss, blankSupplier(storeCurrency)])}
            disabled={suppliers.length >= 30}
          >
            + Add supplier
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {fetchMsg && <p className={`rounded-lg border px-3 py-2 text-sm ${msgColor[fetchMsg.kind]}`}>{fetchMsg.text}</p>}
          {suppliers.map((s, i) => (
            <div
              key={s.id ?? i}
              className={`rounded-xl border p-4 ${s.isDefault ? "border-brand-300 bg-brand-50/40" : "border-slate-200"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="defaultSupplier"
                    checked={s.isDefault}
                    onChange={() => setDefaultSupplier(i)}
                    className="accent-brand-600"
                  />
                  Default supplier
                </label>
                {suppliers.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeSupplier(i)}>
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Field label="Supplier name">
                    <Input value={s.name} onChange={(e) => updateSupplier(i, { name: e.target.value })} placeholder="AliExpress" />
                  </Field>
                </div>
                <div className="sm:col-span-4">
                  <Field label="Product URL">
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        value={s.url}
                        onChange={(e) => updateSupplier(i, { url: e.target.value })}
                        placeholder="https://www.aliexpress.com/item/…"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => fetchFromUrl(i)}
                        disabled={fetchingIdx !== null}
                        className="shrink-0"
                      >
                        {fetchingIdx === i ? "Fetching…" : "Fetch"}
                      </Button>
                    </div>
                  </Field>
                </div>
                <Field label="Unit price">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={s.unitPrice}
                    onChange={(e) => updateSupplier(i, { unitPrice: e.target.value })}
                  />
                </Field>
                <Field label="Currency">
                  <Select value={s.currency} onChange={(e) => updateSupplier(i, { currency: e.target.value as Cur })}>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                  </Select>
                </Field>
                <Field label="Ship to US (days)">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={s.shipDaysUS}
                    onChange={(e) => updateSupplier(i, { shipDaysUS: e.target.value })}
                    placeholder="e.g. 12"
                  />
                </Field>
                <Field label="Ship to UK (days)">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={s.shipDaysUK}
                    onChange={(e) => updateSupplier(i, { shipDaysUK: e.target.value })}
                    placeholder="e.g. 10"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes">
                    <Input value={s.notes} onChange={(e) => updateSupplier(i, { notes: e.target.value })} placeholder="optional" />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Listing details */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Listing details</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={10000} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={`Listed price (${storeCurrency})`} hint="Your selling price, in the store currency">
              <Input type="number" step="0.01" min="0" value={listedPrice} onChange={(e) => setListedPrice(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Profit preview</p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{profitLabel(profit.overall)}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Images</h3>
              <p className="text-xs text-slate-400">Upload from your device or paste an image URL. The first is the primary image.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setImages((imgs) => [...imgs, ""])}
              disabled={images.length >= 20}
            >
              + Add image
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {images.map((url, i) => (
            <div key={i} className="flex items-center gap-3">
              {url.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-slate-300" />
              )}
              <Input
                type="url"
                value={url}
                onChange={(e) => setImages((imgs) => imgs.map((u, idx) => (idx === i ? e.target.value : u)))}
                placeholder="https://…/image.jpg"
              />
              {i === 0 && <span className="shrink-0 text-xs font-medium text-brand-600">Primary</span>}
              <UploadButton upload={uploadFile} onUploaded={(u) => setImages((imgs) => imgs.map((x, idx) => (idx === i ? u : x)))} />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setImages((imgs) => (imgs.length === 1 ? [""] : imgs.filter((_, idx) => idx !== i)))}
              >
                Remove
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Variants</h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setVariants((vs) => [...vs, { name: "", sku: "", imageUrl: "", supplierPrice: "", listedPrice: "" }])}
              disabled={variants.length >= 100}
            >
              + Add variant
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {variants.length === 0 && (
            <p className="text-sm text-slate-400">No variants. Add some if the product has options like size or colour.</p>
          )}
          {variants.map((v, i) => (
            <div key={v.id ?? i} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Field label="Name">
                    <Input value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} placeholder="Red / XL" />
                  </Field>
                </div>
                <Field label="SKU">
                  <Input value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                </Field>
                <Field label={`Supplier (${defSupplierCurrency})`}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.supplierPrice}
                    onChange={(e) => updateVariant(i, { supplierPrice: e.target.value })}
                    placeholder={defaultSupplier?.unitPrice}
                  />
                </Field>
                <Field label={`Listed (${storeCurrency})`}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.listedPrice}
                    onChange={(e) => updateVariant(i, { listedPrice: e.target.value })}
                    placeholder={listedPrice}
                  />
                </Field>
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">Profit</p>
                  <p className="py-2 text-sm">{profitLabel(profit.variants[i] ?? null)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {v.imageUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-lg border border-dashed border-slate-300" />
                )}
                <Input
                  type="url"
                  value={v.imageUrl}
                  onChange={(e) => updateVariant(i, { imageUrl: e.target.value })}
                  placeholder="Variant image URL, or upload →"
                />
                <UploadButton upload={uploadFile} onUploaded={(u) => updateVariant(i, { imageUrl: u })} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setVariants((vs) => vs.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {!sameCurrency && (
            <p className="text-xs text-slate-400">
              Supplier prices are in {defSupplierCurrency} and listed prices in {storeCurrency}; profit shown is approx —
              converted at order time.
            </p>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create listing"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push(`/stores/${storeId}/listings`)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
